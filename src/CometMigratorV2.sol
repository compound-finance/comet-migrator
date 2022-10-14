// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import "./vendor/@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3FlashCallback.sol";
import "./vendor/@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "./vendor/@uniswap/v3-periphery/contracts/interfaces/external/IWETH9.sol";
import "./vendor/@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "./vendor/@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/CTokenInterface.sol";
import "./interfaces/CometInterface.sol";

/**
 * @title Compound V3 Migrator v2
 * @notice A contract to help migrate a Compound v2 position or other DeFi position into a similar Compound v3 position.
 * @author Compound
 */
contract CometMigratorV2 is IUniswapV3FlashCallback {
  error Reentrancy(uint256 loc);
  error CompoundV2Error(uint256 loc, uint256 code);
  error SweepFailure(uint256 loc);
  error CTokenTransferFailure();
  error InvalidConfiguration(uint256 loc);
  error InvalidCallback(uint256 loc);
  error InvalidInputs(uint256 loc);

  /** Events **/
  event Migrated(
    address indexed user,
    CompoundV2Position compoundV2Position,
    uint256 flashAmount,
    uint256 flashAmountWithFee);

  /// @notice Represents an entire Compound V2 position (collateral + borrows) to migrate.
  struct CompoundV2Position {
    CompoundV2Collateral[] collateral;
    CompoundV2Borrow[] borrows;
    bytes[] paths; // empty path if no swap is required (e.g. repaying USDC borrow)
  }

  /// @notice Represents a given amount of Compound V2 collateral to migrate.
  struct CompoundV2Collateral {
    CTokenLike cToken;
    uint256 amount;
  }

  /// @notice Represents a given amount of Compound V2 borrow to migrate.
  struct CompoundV2Borrow {
    CErc20 cToken;
    uint256 amount;
  }

  /// @notice Represents all data required to continue operation after a flash loan is initiated.
  struct MigrationCallbackData {
    address user;
    uint256 flashAmount;
    CompoundV2Position compoundV2Position;
  }

  /// @notice The Comet Ethereum mainnet USDC contract
  Comet public immutable comet;

  /// @notice The Uniswap pool used by this contract to source liquidity (i.e. flash loans).
  IUniswapV3Pool public immutable uniswapLiquidityPool;

  /// @notice True if borrow token is token 0 in the Uniswap liquidity pool, otherwise false if token 1.
  bool public immutable isUniswapLiquidityPoolToken0;

  /// @notice Uniswap router used for token swaps.
  ISwapRouter public immutable swapRouter;

  /// @notice The underlying borrow token (e.g. `USDC`).
  IERC20 public immutable baseToken;

  /// @notice The address of the `cETH` token.
  CTokenLike public immutable cETH;

  /// @notice The address of the `weth` token.
  IWETH9 public immutable weth;

  /// @notice Address to send swept tokens to, if for any reason they remain locked in this contract.
  address payable public immutable sweepee;

  /// @notice A reentrancy guard.
  uint256 public inMigration;

  /**
   * @notice Construct a new Compound_Migrate_V2_USDC_to_V3_USDC
   * @param comet_ The Comet Ethereum mainnet USDC contract.
   * @param baseToken_ The base token of the Compound III market (e.g. `USDC`).
   * @param cETH_ The address of the `cETH` token.
   * @param weth_ The address of the `WETH9` token.
   * @param uniswapLiquidityPool_ The Uniswap pool used by this contract to source liquidity (i.e. flash loans).
   * @param swapRouter_ The Uniswap router for facilitating token swaps.
   * @param sweepee_ Sweep excess tokens to this address.
   **/
  constructor(
    Comet comet_,
    IERC20 baseToken_,
    CTokenLike cETH_,
    IWETH9 weth_,
    IUniswapV3Pool uniswapLiquidityPool_,
    ISwapRouter swapRouter_,
    address payable sweepee_
  ) {
    // **WRITE IMMUTABLE** `comet = comet_`
    comet = comet_;

    // **WRITE IMMUTABLE** `baseToken = baseToken_`
    baseToken = baseToken_;

    // **WRITE IMMUTABLE** `cETH = cETH_`
    cETH = cETH_;

    // **WRITE IMMUTABLE** `weth = weth_`
    weth = weth_;

    // **WRITE IMMUTABLE** `uniswapLiquidityPool = uniswapLiquidityPool_`
    uniswapLiquidityPool = uniswapLiquidityPool_;

    // **WRITE IMMUTABLE** `isUniswapLiquidityPoolToken0 = uniswapLiquidityPool.token0() == baseToken`
    isUniswapLiquidityPoolToken0 = uniswapLiquidityPool.token0() == address(baseToken);

    // **REQUIRE** `isUniswapLiquidityPoolToken0 || uniswapLiquidityPool.token1() == baseToken`
    if (!isUniswapLiquidityPoolToken0 && uniswapLiquidityPool.token1() != address(baseToken)) {
      revert InvalidConfiguration(0);
    }

    // **WRITE IMMUTABLE** `swapRouter = swapRouter_`
    swapRouter = swapRouter_;

    // **WRITE IMMUTABLE** `sweepee = sweepee_`
    sweepee = sweepee_;

    // **CALL** `baseToken.approve(address(swapRouter), type(uint256).max)`
    baseToken.approve(address(swapRouter), type(uint256).max);
  }

  /**
   * @notice This is the core function of this contract, migrating a position from Compound II to Compound III. We use a flash loan from Uniswap to provide liquidity to move the position.
   * @param compoundV2Position Structure containing the user’s Compound V2 collateral and borrow positions to migrate to Compound III. See notes below.
   * @param flashAmount Amount of base asset to borrow from the Uniswap flash loan to facilitate the migration. See notes below.
   * @dev **N.B.** Collateral requirements may be different in Compound II and Compound III. This may lead to a migration failing or being less collateralized after the migration. There are fees associated with the flash loan, which may affect position or cause migration to fail.
   * @dev Note: each `collateral` market must be supported in Compound III.
   * @dev Note: `collateral` amounts of 0 are strictly ignored. Collateral amounts of max uint256 are set to the user's current balance.
   * @dev Note: `flashAmount` is provided by the user as a hint to the Migrator to know the maximum expected cost (in terms of the base asset) of the migration. If `flashAmount` is less than the total amount needed to migrate the user’s positions, the transaction will revert.
   **/
  function migrate(CompoundV2Position calldata compoundV2Position, uint256 flashAmount) external {
    // **REQUIRE** `inMigration == 0`
    if (inMigration != 0) {
      revert Reentrancy(0);
    }

    // **STORE** `inMigration += 1`
    inMigration += 1;

    // **BIND** `user = msg.sender`
    address user = msg.sender;

    // **REQUIRE** `compoundV2Position.borrows.length == compoundV2Position.paths.length`
    if (compoundV2Position.borrows.length != compoundV2Position.paths.length) {
      revert InvalidInputs(0);
    }

    // **BIND** `data = abi.encode(MigrationCallbackData{user, flashAmount, compoundV2Position, avveV2Position, makerPositions})`
    bytes memory data = abi.encode(MigrationCallbackData({
      user: user,
      flashAmount: flashAmount,
      compoundV2Position: compoundV2Position
    }));

    // **CALL** `uniswapLiquidityPool.flash(address(this), isUniswapLiquidityPoolToken0 ? flashAmount : 0, isUniswapLiquidityPoolToken0 ? 0 : flashAmount, data)`
    uniswapLiquidityPool.flash(address(this), isUniswapLiquidityPoolToken0 ? flashAmount : 0, isUniswapLiquidityPoolToken0 ? 0 : flashAmount, data);

    // **STORE** `inMigration -= 1`
    inMigration -= 1;
  }

  /**
   * @notice This function handles a callback from the Uniswap Liquidity Pool after it has sent this contract the requested tokens. We are responsible for repaying those tokens, with a fee, before we return from this function call.
   * @param fee0 The fee for borrowing token0 from pool.
   * @param fee1 The fee for borrowing token1 from pool.
   * @param data The data encoded above, which is the ABI-encoding of `MigrationCallbackData`.
   **/
  function uniswapV3FlashCallback(uint256 fee0, uint256 fee1, bytes calldata data) external {
    // **REQUIRE** `inMigration == 1`
    if (inMigration != 1) {
      revert Reentrancy(1);
    }

    // **REQUIRE** `msg.sender == uniswapLiquidityPool`
    if (msg.sender != address(uniswapLiquidityPool)) {
      revert InvalidCallback(0);
    }

    // **BIND** `MigrationCallbackData{user, flashAmount, compoundV2Position, avveV2Position, cdpPositions} = abi.decode(data, (MigrationCallbackData))`
    MigrationCallbackData memory migrationData = abi.decode(data, (MigrationCallbackData));

    // **BIND** `flashAmountWithFee = flashAmount + isUniswapLiquidityPoolToken0 ? fee0 : fee1`
    uint256 flashAmountWithFee = migrationData.flashAmount + ( isUniswapLiquidityPoolToken0 ? fee0 : fee1 );

    // **EXEC** `migrateCompoundV2Position(user, compoundV2Position)`
    migrateCompoundV2Position(migrationData.user, migrationData.compoundV2Position);

    // **CALL** `comet.withdrawFrom(user, address(this), baseToken, flashAmountWithFee - baseToken.balanceOf(address(this)))`
    comet.withdrawFrom(migrationData.user, address(this), address(baseToken), flashAmountWithFee - baseToken.balanceOf(address(this)));

    // **CALL** `baseToken.transfer(address(uniswapLiquidityPool), flashAmountWithFee)`
    baseToken.transfer(address(uniswapLiquidityPool), flashAmountWithFee);

    // **EMIT** `Migrated(user, compoundV2Position, aaveV2Position, cdpPositions, flashAmount, flashAmountWithFee)`
    emit Migrated(migrationData.user, migrationData.compoundV2Position, migrationData.flashAmount, flashAmountWithFee);
  }

  /**
   * @notice This internal helper function repays the user’s borrow positions on Compound V2 (executing swaps first if necessary) before migrating their collateral over to Compound III.
   * @param user Alias for the `msg.sender` of the original `migrate` call.
   * @param position Structure containing the user’s Compound V2 collateral and borrow positions to migrate to Compound III.
   **/
  function migrateCompoundV2Position(address user, CompoundV2Position memory position) internal {
    // **FOREACH** `(cToken, borrowAmount): CompoundV2Borrow, path: bytes` in `position`:
    for (uint i = 0; i < position.borrows.length; i++) {
      CompoundV2Borrow memory borrow = position.borrows[i];
      uint256 repayAmount;
      // **WHEN** `borrowAmount == type(uint256).max)`:
      if (borrow.amount == type(uint256).max) {
        // **BIND READ** `repayAmount = cToken.borrowBalanceCurrent(user)`
        repayAmount = borrow.cToken.borrowBalanceCurrent(user);
      } else {
        // **BIND** `repayAmount = borrowAmount`
        repayAmount = borrow.amount;
      }

      // **WHEN** `path.length > 0`:
      if (position.paths[i].length > 0) {
        // **CALL** `ISwapRouter.exactOutput(ExactOutputParams({path: path, recipient: address(this), amountOut: repayAmount, amountInMaximum: type(uint256).max})`
        uint256 amountIn = swapRouter.exactOutput(
          ISwapRouter.ExactOutputParams({
              path: position.paths[i],
              recipient: address(this),
              amountOut: repayAmount,
              amountInMaximum: type(uint256).max,
              deadline: block.timestamp
          })
        );
        // XXX Should we keep a running counter of how much borrowed asset is left? (subtract `amountIn` from `flashAmount`)
      }

      // **CALL** `cToken.underlying().approve(address(cToken), repayAmount)`
      borrow.cToken.underlying().approve(address(borrow.cToken), repayAmount);

      // **CALL** `cToken.repayBorrowBehalf(user, repayAmount)`
      uint256 err = borrow.cToken.repayBorrowBehalf(user, repayAmount);
      if (err != 0) {
        revert CompoundV2Error(0, err);
      }
    }

    // **FOREACH** `(cToken, amount): CompoundV2Collateral` in `position.collateral`:
    for (uint i = 0; i < position.collateral.length; i++) {
      // **CALL** `cToken.transferFrom(user, address(this), amount == type(uint256).max ? cToken.balanceOf(user) : amount)`
      CompoundV2Collateral memory collateral = position.collateral[i];
      bool transferSuccess = collateral.cToken.transferFrom(
        user,
        address(this),
        collateral.amount == type(uint256).max ? collateral.cToken.balanceOf(user) : collateral.amount
      );
      if (!transferSuccess) {
        revert CTokenTransferFailure();
      }

      // **CALL** `cToken.redeem(cToken.balanceOf(address(this)))`
      uint256 err = collateral.cToken.redeem(collateral.cToken.balanceOf(address(this)));
      if (err != 0) {
        revert CompoundV2Error(1 + i, err);
      }

      IERC20 underlying;

      // **WHEN** `cToken == cETH`:
      if (collateral.cToken == cETH) {
        // **CALL** `weth.deposit{value: address(this).balance}()`
        weth.deposit{value: address(this).balance}();

        // **BIND** `underlying = weth`
        underlying = weth;
      } else {
        // **BIND** `underlying = cToken.underlying()`
        underlying = CErc20(address(collateral.cToken)).underlying();
      }

      // **CALL** `underlying.approve(address(comet), type(uint256).max)`
      underlying.approve(address(comet), type(uint256).max);

      // **CALL** `comet.supplyTo(user, underlying, underlying.balanceOf(address(this)))`
      comet.supplyTo(
        user,
        address(underlying),
        underlying.balanceOf(address(this))
      );
    }
  }

  /**
   * @notice Sends any tokens in this contract to the sweepee address. This contract should never hold tokens, so this is just to fix any anomalistic situations where tokens end up locked in the contract.
   * @param token The token to sweep
   **/
  function sweep(IERC20 token) external {
    // **REQUIRE** `inMigration == 0`
    if (inMigration != 0) {
      revert Reentrancy(2);
    }

    // **WHEN** `token == 0x0000000000000000000000000000000000000000`:
    if (token == IERC20(0x0000000000000000000000000000000000000000)) {
      // **EXEC** `sweepee.send(address(this).balance)`
      if (!sweepee.send(address(this).balance)) {
        revert SweepFailure(0);
      }
    } else {
      // **CALL** `token.transfer(sweepee, token.balanceOf(address(this)))`
      if (!token.transfer(sweepee, token.balanceOf(address(this)))) {
        revert SweepFailure(1);
      }
    }
  }

  receive() external payable {
    // NO-OP
  }
}