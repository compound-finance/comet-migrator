// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import "./vendor/@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3FlashCallback.sol";
import "./vendor/@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "./vendor/@uniswap/v3-periphery/contracts/interfaces/external/IWETH9.sol";
import "./vendor/@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/CTokenInterface.sol";
import "./interfaces/CometInterface.sol";

/**
 * @title Compound V3 Migrator
 * @notice A contract to help migrate a Compound v2 position or other DeFi position into a similar Compound v3 position.
 * @author Compound
 */
contract CometMigrator is IUniswapV3FlashCallback {
  error Reentrancy(uint256 loc);
  error CompoundV2Error(uint256 loc, uint256 code);
  error SweepFailure(uint256 loc);
  error CTokenTransferFailure();

  /** Events **/
  event Migrated(
    address indexed user,
    Collateral[] collateral,
    uint256 repayAmount,
    uint256 borrowAmountWithFee);

  /// @notice Represents a given amount of collateral to migrate.
  struct Collateral {
    CTokenLike cToken;
    uint256 amount;
  }

  struct BorrowData {
     CErc20 borrowCToken; // XXX how would we adapt this for other sources?
     uint256 borrowAmount;
     IUniswapV3Pool pool;
     bool isFlashLoan; // as opposed to flash swap
  }

  /// @notice Represents all data required to continue operation after a flash loan is initiated.
  struct MigrationCallbackData {
    address user;
    BorrowData[] borrowData;
    Collateral[] collateral;
    uint256 step;
  }

  /// @notice The Comet Ethereum mainnet USDC contract
  Comet public immutable comet;

  /// @notice A list of valid collateral tokens
  IERC20[] public collateralTokens;

  /// @notice The address of the `cETH` token.
  CTokenLike public immutable cETH;

  /// @notice The address of the `weth` token.
  IWETH9 public immutable weth;

  /// @notice Address to send swept tokens to, if for any reason they remain locked in this contract.
  address payable public immutable sweepee;

  /// @notice A rëentrancy guard.
  uint public inMigration;

  /**
   * @notice Construct a new Compound_Migrate_V2_USDC_to_V3_USDC
   * @param comet_ The Comet Ethereum mainnet USDC contract.
   * @param cETH_ The address of the `cETH` token.
   * @param weth_ The address of the `WETH9` token.
   * @param sweepee_ Sweep excess tokens to this address.
   **/
  constructor(
    Comet comet_,
    CTokenLike cETH_,
    IWETH9 weth_,
    address payable sweepee_
  ) payable {
    // **WRITE IMMUTABLE** `comet = comet_`
    comet = comet_;

    // **WRITE IMMUTABLE** `cETH = cETH_`
    cETH = cETH_;

    // **WRITE IMMUTABLE** `weth = weth_`
    weth = weth_;

    // **WRITE IMMUTABLE** `sweepee = sweepee_`
    sweepee = sweepee_;
  }

  /**
   * @notice This is the core function of this contract, migrating a position from Compound II to Compound III. We use a flash loan from Uniswap to provide liquidity to move the position.
   * @param collateral Array of collateral to transfer into Compound III. See notes below.
   * @param borrowData Amount of borrow to migrate (i.e. close in Compound II, and borrow from Compound III). See notes below.
   * @dev **N.B.** Collateral requirements may be different in Compound II and Compound III. This may lead to a migration failing or being less collateralized after the migration. There are fees associated with the flash loan, which may affect position or cause migration to fail.
   * @dev Note: each `collateral` market must exist in `collateralTokens` array, defined on contract creation.
   * @dev Note: each `collateral` market must be supported in Compound III.
   * @dev Note: `collateral` amounts of 0 are strictly ignored. Collateral amounts of max uint256 are set to the user's current balance.
   * @dev Note: `borrowAmount` may be set to max uint256 to migrate the entire current borrow balance.
   **/
  function migrate(Collateral[] calldata collateral, BorrowData[] memory borrowData) external {
    // **REQUIRE** `inMigration == 0`
    if (inMigration != 0) {
      revert Reentrancy(0);
    }

    // **STORE** `inMigration += 1`
    inMigration += 1;

    // **BIND** `user = msg.sender`
    address user = msg.sender;

    // **WHEN** `repayAmount == type(uint256).max)`:
    for (uint i = 0; i < borrowData.length; i++) {
      uint repayAmount;
      uint borrowAmount = borrowData[i].borrowAmount;
      if (borrowAmount == type(uint256).max) {
        // **BIND READ** `repayAmount = borrowCToken.borrowBalanceCurrent(user)`
        repayAmount = borrowData[i].borrowCToken.borrowBalanceCurrent(user);
      } else {
        // **BIND** `repayAmount = borrowAmount`
        repayAmount = borrowAmount;
      }
      borrowData[i].borrowAmount = repayAmount; // XXX can optimize this a bit...kind of redundant
    }

    // **BIND** `data = abi.encode(MigrationCallbackData{user, repayAmount, collateral})`
    // XXX can check if remaingBorrowData is empty. if so, then remove all collateral and repay
    bytes memory data = abi.encode(MigrationCallbackData({
      user: user,
      borrowData: borrowData,
      collateral: collateral,
      step: 0 // used to access data in borrowData
    }));

    /**
      Example

      User collat: 500 WETH, 50 WBTC, Borrow: 1000 DAI, 1000 USDC
      Input is: 500 WETH, 50 WBTC, [{ cDAI, 1000, USDC-DAI }, { cDAI, 1000, USDC-DAI XXX ugh...might need to use a flash loan }]
     */

    // XXX use helper to either flash or swap
    BorrowData memory initialBorrowData = borrowData[0];
    IERC20 borrowToken = initialBorrowData.borrowCToken.underlying();
    bool isPoolToken0 = initialBorrowData.pool.token0() == address(borrowToken);
    if (initialBorrowData.isFlashLoan) {
      // **CALL** `uniswapLiquidityPool.flash(address(this), uniswapLiquidityPoolToken0 ? repayAmount : 0, uniswapLiquidityPoolToken0 ? 0 : repayAmount, data)`
      uint repayAmount = initialBorrowData.borrowAmount;
      initialBorrowData.pool.flash(address(this), isPoolToken0 ? repayAmount : 0, isPoolToken0 ? 0 : repayAmount, data);
    } else {
      // // XXX check for empty borrowData
      // IERC20 borrowToken = initialBorrowData.borrowCToken.underlying();
      // bool isPoolToken0 = uniswapLiquidityPool.token0() == address(borrowToken);
      // initialBorrowData.pool.swap(
      //     address(this),
      //     !isPoolToken0,
      //     initialBorrowData.borrowAmount,
      //     0, // XXX sqrtPriceLimitX96
      //     data
      // );
    }

    // **STORE** `inMigration -= 1`
    inMigration -= 1;
  }

  /**
   * @notice This function handles a callback from the Uniswap Liquidity Pool after it has sent this contract the requested tokens. We are responsible for repaying those tokens, with a fee, before we return from this function call.
   * @param fee0 The fee for borrowing token0 from pool.
   * @param fee1 The fee for borrowing token1 from pool.
   * @param data The data encoded above, which is the ABI-encoding of XXX.
   **/
   // XXX only withdraw collateral on last, when borrowdata is empty (or length of 1?)
  function uniswapV3FlashCallback(uint256 fee0, uint256 fee1, bytes calldata data) external {
    // **REQUIRE** `inMigration == 1`
    if (inMigration != 1) {
      revert Reentrancy(1);
    }

    MigrationCallbackData memory migrationData = abi.decode(data, (MigrationCallbackData));
    BorrowData memory currentBorrowData = migrationData.borrowData[migrationData.step];

    // **REQUIRE** `msg.sender == uniswapLiquidityPool`
    require(msg.sender == address(currentBorrowData.pool), "must be called from uniswapLiquidityPool");

    IERC20 borrowToken = currentBorrowData.borrowCToken.underlying(); // XXX gassy, should just pass in as calldata from migrate()

    // **BIND** `MigrationCallbackData{user, repayAmountActual, borrowAmountTotal, collateral} = abi.decode(data, (MigrationCallbackData))`
    // MigrationCallbackData memory migrationData = abi.decode(data, (MigrationCallbackData));

    // **BIND** `borrowAmountWithFee = repayAmount + uniswapLiquidityPoolToken0 ? fee0 : fee1`
    uint repayAmount = currentBorrowData.borrowAmount;
    bool isPoolToken0 = currentBorrowData.pool.token0() == address(borrowToken);
    uint256 borrowAmountWithFee = repayAmount + ( isPoolToken0 ? fee0 : fee1 );

    // **CALL** `borrowCToken.repayBorrowBehalf(user, repayAmountActual)`
    borrowToken.approve(address(currentBorrowData.borrowCToken), type(uint256).max);
    uint256 err = currentBorrowData.borrowCToken.repayBorrowBehalf(migrationData.user, repayAmount);
    if (err != 0) {
      revert CompoundV2Error(0, err);
    }

    // XXX OVER HERE, REDEEM COLLATERAL ONLY IF REMAINING BORROW DATA IS EMPTY
    // OTHERWISE, TRIGGER A RECURSIVE FLASH SWAP / LOAN

    // **FOREACH** `(cToken, amount)` in `collateral`
    for (uint8 i = 0; i < migrationData.collateral.length; i++) {
      // **CALL** `cToken.transferFrom(user, amount == type(uint256).max ? cToken.balanceOf(user) : amount)`
      Collateral memory collateral = migrationData.collateral[i];
      bool transferSuccess = collateral.cToken.transferFrom(
        migrationData.user,
        address(this),
        collateral.amount == type(uint256).max ? collateral.cToken.balanceOf(migrationData.user) : collateral.amount
      );
      if (!transferSuccess) {
        revert CTokenTransferFailure();
      }

      // **CALL** `cToken.redeem(cToken.balanceOf(address(this)))`
      err = collateral.cToken.redeem(collateral.cToken.balanceOf(address(this)));
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

      // **CALL** `comet.supplyTo(address(this), user, cToken.underlying(), cToken.underlying().balanceOf(address(this)))`
      comet.supplyTo(
        migrationData.user,
        address(underlying),
        underlying.balanceOf(address(this))
      );
    }

    // **CALL** `comet.withdrawFrom(user, address(this), borrowToken, borrowAmountWithFee)`
    comet.withdrawFrom(migrationData.user, address(this), address(borrowToken), borrowAmountWithFee);

    // **CALL** `borrowToken.transfer(address(uniswapLiquidityPool), borrowAmountWithFee)`
    borrowToken.transfer(address(currentBorrowData.pool), borrowAmountWithFee);

    // **EMIT** `Migrated(user, collateral, repayAmount, borrowAmountWithFee)`
    emit Migrated(migrationData.user, migrationData.collateral, repayAmount, borrowAmountWithFee);
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

  // function uniswapV3SwapCallback(
  //   int256 amount0Delta,
  //   int256 amount1Delta,
  //   bytes data
  // ) external {

  // }

  receive() external payable {
    // NO-OP
  }
}
