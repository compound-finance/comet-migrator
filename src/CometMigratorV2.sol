// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import "./vendor/@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3FlashCallback.sol";
import "./vendor/@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "./vendor/@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "./vendor/@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/AaveInterface.sol";
import "./interfaces/CTokenInterface.sol";
import "./interfaces/CometInterface.sol";
import "./interfaces/IWETH9.sol";
import "./interfaces/MakerInterface.sol";

/**
 * @title Compound III Migrator v2
 * @notice A contract to help migrate a Compound II or Aave v2 position into a similar Compound III position.
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
    AaveV2Position aaveV2Position,
    CDPPosition[] cdpPositions,
    uint256 flashAmount,
    uint256 flashAmountWithFee);

  /// @notice Represents an entire Compound II position (collateral + borrows) to migrate.
  struct CompoundV2Position {
    CompoundV2Collateral[] collateral;
    CompoundV2Borrow[] borrows;
    bytes[] paths; // empty path if no swap is required (e.g. repaying USDC borrow)
  }

  /// @notice Represents a given amount of Compound II collateral to migrate.
  struct CompoundV2Collateral {
    CTokenLike cToken;
    uint256 amount; // Note: This is the amount of the cToken
  }

  /// @notice Represents a given amount of Compound II borrow to migrate.
  struct CompoundV2Borrow {
    CTokenLike cToken;
    uint256 amount; // Note: This is the amount of the underlying, not the cToken
  }

  /// @notice Represents an entire Aave v2 position (collateral + borrows) to migrate.
  struct AaveV2Position {
    AaveV2Collateral[] collateral;
    AaveV2Borrow[] borrows;
    bytes[] paths; // empty path if no swap is required (e.g. repaying USDC borrow)
  }

  /// @notice Represents a given amount of Aave v2 collateral to migrate.
  struct AaveV2Collateral {
    ATokenLike aToken;
    uint256 amount;
  }

  /// @notice Represents a given amount of Aave v2 borrow to migrate.
  struct AaveV2Borrow {
    ADebtTokenLike aDebtToken; // Note: Aave has two separate debt tokens per asset: stable and variable rate
    uint256 amount;
  }

  /// @notice Represents a CDP position on Maker to migrate.
  struct CDPPosition {
    uint256 cdpId;
    uint256 collateralAmount;
    uint256 borrowAmount;
    bytes path; // empty path if no swap is required (e.g. repaying USDC borrow)
    GemJoinLike gemJoin; // the adapter contract for depositing/withdrawing collateral
  }

  /// @notice Represents all data required to continue operation after a flash loan is initiated.
  struct MigrationCallbackData {
    address user;
    uint256 flashAmount;
    CompoundV2Position compoundV2Position;
    AaveV2Position aaveV2Position;
    CDPPosition[] cdpPositions;
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
  IERC20NonStandard public immutable baseToken;

  /// @notice The address of the `cETH` token.
  CTokenLike public immutable cETH;

  /// @notice The address of the `weth` token.
  IWETH9 public immutable weth;

  /// @notice The address of the Aave v2 LendingPool contract. This is the contract that all `withdraw` and `repay` transactions go through.
  ILendingPool public immutable aaveV2LendingPool;

  /// @notice The address of the Maker CDP Manager contract. This is used to manage CDP positions owned by the user.
  ManagerLike public immutable cdpManager;

  /// @notice The address of the DaiJoin contract used to deposit/withdraw DAI into the Maker system.
  DaiJoinLike public immutable daiJoin;

  /// @notice The address of the DAI token.
  IERC20NonStandard public immutable dai;

  /// @notice Address to send swept tokens to, if for any reason they remain locked in this contract.
  address payable public immutable sweepee;

  /// @notice A reentrancy guard.
  uint256 public inMigration;

  // Units used in Maker contracts
  uint256 internal constant RAY = 10 ** 27;

  /**
   * @notice Construct a new CometMigratorV2
   * @param comet_ The Comet Ethereum mainnet USDC contract.
   * @param baseToken_ The base token of the Compound III market (e.g. `USDC`).
   * @param cETH_ The address of the `cETH` token.
   * @param weth_ The address of the `WETH9` token.
   * @param aaveV2LendingPool_ The address of the Aave v2 LendingPool contract. This is the contract that all `withdraw` and `repay` transactions go through.
   * @param cdpManager_ The address of the Maker CDP Manager contract. This is used to manage CDP positions owned by the user.
   * @param daiJoin_ The address of the DaiJoin contract used to deposit/withdraw DAI into the Maker system.
   * @param uniswapLiquidityPool_ The Uniswap pool used by this contract to source liquidity (i.e. flash loans).
   * @param swapRouter_ The Uniswap router for facilitating token swaps.
   * @param sweepee_ Sweep excess tokens to this address.
   **/
  constructor(
    Comet comet_,
    IERC20NonStandard baseToken_,
    CTokenLike cETH_,
    IWETH9 weth_,
    ILendingPool aaveV2LendingPool_,
    ManagerLike cdpManager_,
    DaiJoinLike daiJoin_,
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

    // **WRITE IMMUTABLE** `aaveV2LendingPool = aaveV2LendingPool_`
    aaveV2LendingPool = aaveV2LendingPool_;

    // **WRITE IMMUTABLE** `cdpManager = cdpManager_`
    cdpManager = cdpManager_;

    // **WRITE IMMUTABLE** `daiJoin = daiJoin_`
    daiJoin = daiJoin_;

    // **WRITE IMMUTABLE** `dai = daiJoin_.dai()`
    dai = IERC20NonStandard(daiJoin_.dai());

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
   * @param compoundV2Position Structure containing the user’s Compound II collateral and borrow positions to migrate to Compound III. See notes below.
   * @param aaveV2Position Structure containing the user’s Compound II collateral and borrow positions to migrate to Compound III. See notes below.
   * @param cdpPositions List of structures that each represent a single CDP’s collateral and borrow position to migrate to Compound III. See notes below.
   * @param flashAmount Amount of base asset to borrow from the Uniswap flash loan to facilitate the migration. See notes below.
   * @dev **N.B.** Collateral requirements may be different in Compound II and Compound III. This may lead to a migration failing or being less collateralized after the migration. There are fees associated with the flash loan, which may affect position or cause migration to fail.
   * @dev Note: each `collateral` market must be supported in Compound III.
   * @dev Note: `collateral` amounts of 0 are strictly ignored. Collateral amounts of max uint256 are set to the user's current balance.
   * @dev Note: `flashAmount` is provided by the user as a hint to the Migrator to know the maximum expected cost (in terms of the base asset) of the migration. If `flashAmount` is less than the total amount needed to migrate the user’s positions, the transaction will revert.
   **/
  function migrate(CompoundV2Position calldata compoundV2Position, AaveV2Position calldata aaveV2Position, CDPPosition[] calldata cdpPositions, uint256 flashAmount) external {
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

    // **REQUIRE** `aaveV2Position.borrows.length == aaveV2Position.paths.length`
    if (aaveV2Position.borrows.length != aaveV2Position.paths.length) {
      revert InvalidInputs(1);
    }

    // **BIND** `data = abi.encode(MigrationCallbackData{user, flashAmount, compoundV2Position, aaveV2Position, makerPositions})`
    bytes memory data = abi.encode(MigrationCallbackData({
      user: user,
      flashAmount: flashAmount,
      compoundV2Position: compoundV2Position,
      aaveV2Position: aaveV2Position,
      cdpPositions: cdpPositions
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

    // **BIND** `MigrationCallbackData{user, flashAmount, compoundV2Position, aaveV2Position, cdpPositions} = abi.decode(data, (MigrationCallbackData))`
    MigrationCallbackData memory migrationData = abi.decode(data, (MigrationCallbackData));

    // **BIND** `flashAmountWithFee = flashAmount + isUniswapLiquidityPoolToken0 ? fee0 : fee1`
    uint256 flashAmountWithFee = migrationData.flashAmount + ( isUniswapLiquidityPoolToken0 ? fee0 : fee1 );

    // **EXEC** `migrateCompoundV2Position(user, compoundV2Position)`
    migrateCompoundV2Position(migrationData.user, migrationData.compoundV2Position);

    // **EXEC** `migrateAaveV2Position(user, aaveV2Position)`
    migrateAaveV2Position(migrationData.user, migrationData.aaveV2Position);

    // **EXEC** `migrateCdpPositions(user, cdpPositions)`
    migrateCdpPositions(migrationData.user, migrationData.cdpPositions);

    // **CALL** `comet.withdrawFrom(user, address(this), baseToken, flashAmountWithFee - baseToken.balanceOf(address(this)))`
    comet.withdrawFrom(migrationData.user, address(this), address(baseToken), flashAmountWithFee - baseToken.balanceOf(address(this)));

    // **CALL** `baseToken.transfer(address(uniswapLiquidityPool), flashAmountWithFee)`
    // Note: No need to check transfer success here because Uniswap should revert on an unsuccessful transfer
    doTransferOut(baseToken, address(uniswapLiquidityPool), flashAmountWithFee);

    // **EMIT** `Migrated(user, compoundV2Position, aaveV2Position, cdpPositions, flashAmount, flashAmountWithFee)`
    emit Migrated(migrationData.user, migrationData.compoundV2Position, migrationData.aaveV2Position, migrationData.cdpPositions, migrationData.flashAmount, flashAmountWithFee);
  }

  /**
   * @notice This internal helper function repays the user’s borrow positions on Compound II (executing swaps first if necessary) before migrating their collateral over to Compound III.
   * @param user Alias for the `msg.sender` of the original `migrate` call.
   * @param position Structure containing the user’s Compound II collateral and borrow positions to migrate to Compound III.
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
      }

      // **WHEN** `cToken == cETH`
      if (borrow.cToken == cETH) {
        CEther cToken = CEther(address(borrow.cToken));

        // **CALL** `weth.withdraw(repayAmount)`
        weth.withdraw(repayAmount);

        // **CALL** `cToken.repayBorrowBehalf{value: repayAmount}(user)
        cToken.repayBorrowBehalf{ value: repayAmount }(user);
      } else {
        CErc20 cToken = CErc20(address(borrow.cToken));

        // **CALL** `cToken.underlying().approve(address(cToken), repayAmount)`
        IERC20NonStandard(cToken.underlying()).approve(address(borrow.cToken), repayAmount);

        // **CALL** `cToken.repayBorrowBehalf(user, repayAmount)`
        uint256 err = cToken.repayBorrowBehalf(user, repayAmount);
        if (err != 0) {
          revert CompoundV2Error(0, err);
        }
      }
    }

    // **FOREACH** `(cToken, amount): CompoundV2Collateral` in `position.collateral`:
    for (uint i = 0; i < position.collateral.length; i++) {
      CompoundV2Collateral memory collateral = position.collateral[i];

      // **CALL** `cToken.transferFrom(user, address(this), amount == type(uint256).max ? cToken.balanceOf(user) : amount)`
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

      IERC20NonStandard underlying;

      // **WHEN** `cToken == cETH`:
      if (collateral.cToken == cETH) {
        // **CALL** `weth.deposit{value: address(this).balance}()`
        weth.deposit{value: address(this).balance}();

        // **BIND** `underlying = weth`
        underlying = weth;
      } else {
        // **BIND** `underlying = cToken.underlying()`
        underlying = IERC20NonStandard(CErc20(address(collateral.cToken)).underlying());
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
   * @notice This internal helper function repays the user’s borrow positions on Aave v2 (executing swaps first if necessary) before migrating their collateral over to Compound III.
   * @param user Alias for the `msg.sender` of the original `migrate` call.
   * @param position Structure containing the user’s Aave v2 collateral and borrow positions to migrate to Compound III.
   **/
  function migrateAaveV2Position(address user, AaveV2Position memory position) internal {
    // **FOREACH** `(aDebtToken, borrowAmount): AaveV2Borrow, path: bytes` in `position`:
    for (uint i = 0; i < position.borrows.length; i++) {
      AaveV2Borrow memory borrow = position.borrows[i];
      uint256 repayAmount;
      // **WHEN** `borrowAmount == type(uint256).max)`:
      if (borrow.amount == type(uint256).max) {
        // **BIND READ** `repayAmount = aDebtToken.balanceOf(user)`
        repayAmount = borrow.aDebtToken.balanceOf(user);
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
      }

      // **BIND READ** `underlyingDebt = aDebtToken.UNDERLYING_ASSET_ADDRESS()`
      IERC20NonStandard underlyingDebt = IERC20NonStandard(borrow.aDebtToken.UNDERLYING_ASSET_ADDRESS());

      // **BIND READ** `rateMode = aDebtToken.DEBT_TOKEN_REVISION()`
      uint256 rateMode = borrow.aDebtToken.DEBT_TOKEN_REVISION();

      // **CALL** `underlyingDebt.approve(address(aaveV2LendingPool), repayAmount)`
      underlyingDebt.approve(address(aaveV2LendingPool), repayAmount);

      // **CALL** `aaveV2LendingPool.repay(underlyingDebt, repayAmount, rateMode, user)`
      aaveV2LendingPool.repay(address(underlyingDebt), repayAmount, rateMode, user);
    }

    // **FOREACH** `(aToken, amount): AaveV2Collateral` in `position.collateral`:
    for (uint i = 0; i < position.collateral.length; i++) {
      AaveV2Collateral memory collateral = position.collateral[i];

      // **CALL** `aToken.transferFrom(user, address(this), amount == type(uint256).max ? aToken.balanceOf(user) : amount)`
      collateral.aToken.transferFrom(
        user,
        address(this),
        collateral.amount == type(uint256).max ? collateral.aToken.balanceOf(user) : collateral.amount
      );

      // **BIND READ** `underlyingCollateral = aToken.UNDERLYING_ASSET_ADDRESS()`
      IERC20NonStandard underlyingCollateral = IERC20NonStandard(collateral.aToken.UNDERLYING_ASSET_ADDRESS());

      // **CALL** `aaveV2LendingPool.withdraw(underlyingCollateral, aToken.balanceOf(address(this)), address(this))`
      aaveV2LendingPool.withdraw(address(underlyingCollateral), collateral.aToken.balanceOf(address(this)), address(this));

      // **CALL** `underlyingCollateral.approve(address(comet), type(uint256).max)`
      underlyingCollateral.approve(address(comet), type(uint256).max);

      // **CALL** `comet.supplyTo(user, underlyingCollateral, underlyingCollateral.balanceOf(address(this)))`
      comet.supplyTo(
        user,
        address(underlyingCollateral),
        underlyingCollateral.balanceOf(address(this))
      );
    }
  }

  /**
   * @notice This internal helper function repays the user’s borrow positions on Maker (executing swaps first if necessary) before migrating their collateral over to Compound III.
   * @param user Alias for the `msg.sender` of the original `migrate` call.
   * @param positions List of structures that each represent a single CDP’s collateral and borrow position to migrate to Compound III.
   **/
  function migrateCdpPositions(address user, CDPPosition[] memory positions) internal {
    VatLike vat = cdpManager.vat();

    // **FOREACH** `(cdpId, borrowAmount, collateralAmount, path, gemJoin): CDPPosition` in `positions`:
    for (uint i = 0; i < positions.length; i++) {
      CDPPosition memory position = positions[i];
      GemJoinLike gemJoin = position.gemJoin;
      uint256 cdpId = position.cdpId;
      bytes32 ilk = cdpManager.ilks(cdpId);
      address urn = cdpManager.urns(cdpId);
      uint256 withdrawAmount18;
      uint256 withdrawAmount;
      uint256 repayAmount;
      // **WHEN** `borrowAmount == type(uint256).max) || collateralAmount == type(uint256).max`:
      if (position.borrowAmount == type(uint256).max || position.collateralAmount == type(uint256).max) {
        // XXX update spec
        // **BIND READ** `(withdrawAmount18, repayAmount) = cdpManager.vat().urns(cdpManager.ilks(cdpId), cdpManager.urns(cdpId))`
        (withdrawAmount18, repayAmount) = vat.urns(ilk, urn);

        // **BIND** `withdrawAmount = withdrawAmount18 / (10 ** (18 - gemJoin.dec()))`
        withdrawAmount = withdrawAmount18 / (10 ** (18 - gemJoin.dec()));
      }

      // **WHEN** `borrowAmount != type(uint256).max`
      if (position.borrowAmount != type(uint256).max) {
        // **BIND** `repayAmount = borrowAmount`
        repayAmount = position.borrowAmount;
      }

      // **WHEN** `collateralAmount != type(uint256).max`
      if (position.collateralAmount != type(uint256).max) {
        // **BIND** `withdrawAmount = collateralAmount`
        withdrawAmount = position.collateralAmount;

        // **BIND** `withdrawAmount18 = collateralAmount * (10 ** (18 - gemJoin.dec()))`
        withdrawAmount18 = position.collateralAmount * (10 ** (18 - gemJoin.dec()));
      }

      // **WHEN** `path.length > 0`:
      if (position.path.length > 0) {
        // **CALL** `ISwapRouter.exactOutput(ExactOutputParams({path: path, recipient: address(this), amountOut: repayAmount, amountInMaximum: type(uint256).max})`
        uint256 amountIn = swapRouter.exactOutput(
          ISwapRouter.ExactOutputParams({
              path: position.path,
              recipient: address(this),
              amountOut: repayAmount,
              amountInMaximum: type(uint256).max,
              deadline: block.timestamp
          })
        );
      }

      // **CALL** `dai.approve(daiJoin, repayAmount)`
      dai.approve(address(daiJoin), repayAmount);

      // **CALL** `daiJoin.join(cdpManager.urns(cdpId), repayAmount)`
      daiJoin.join(cdpManager.urns(cdpId), repayAmount);

      // XXX Convert to int safely
      // XXX DOCUMENT getWipeDart in spec
      // **CALL** `cdpManager.frob(cdpId, 0, -repayAmount)`
      cdpManager.frob(cdpId, 0, getWipeDart(vat, repayAmount, urn, ilk));

      // XXX do we actually need this???
      // **CALL** `cdpManager.frob(cdpId, -withdrawAmount18, 0)`
      cdpManager.frob(cdpId, -int256(withdrawAmount18), 0);

      // **CALL** `cdpManager.flux(cdpId, address(this), withdrawAmount18)`
      cdpManager.flux(cdpId, address(this), withdrawAmount18);

      // **CALL** `gemJoin.exit(address(this), withdrawAmount)`
      gemJoin.exit(address(this), withdrawAmount);

      // **BIND READ** `underlyingCollateral = gemJoin.gem()`
      IERC20NonStandard underlyingCollateral = IERC20NonStandard(gemJoin.gem());

      // **CALL** `underlyingCollateral.approve(address(comet), type(uint256).max)`
      underlyingCollateral.approve(address(comet), type(uint256).max);

      // **CALL** `comet.supplyTo(user, underlyingCollateral, underlyingCollateral.balanceOf(address(this)))
      comet.supplyTo(user, address(underlyingCollateral), underlyingCollateral.balanceOf(address(this)));
    }
  }

  function getWipeDart(
    VatLike vat,
    uint256 amount,
    address urn,
    bytes32 ilk
  ) internal view returns (int dart) {
    // Gets actual rate from the vat
    (, uint rate,,,) = vat.ilks(ilk);
    // Gets actual art value of the urn
    (, uint art) = vat.urns(ilk, urn);

    // Uses the whole dai balance in the vat to reduce the debt
    // XXX safe convert to int
    dart = int256(amount * RAY / rate);
    // Checks the calculated dart is not higher than urn.art (total debt), otherwise uses its value
    dart = uint256(dart) <= art ? -dart : -int256(art);
  }

  /**
    * @notice Similar to ERC-20 transfer, except it also properly handles `transfer` from non-standard ERC-20 tokens.
    * @param asset The ERC-20 token to transfer out.
    * @param to The recipient of the token transfer.
    * @param amount The amount of the token to transfer.
    * @return Boolean indicating the success of the transfer.
    * @dev Note: This wrapper safely handles non-standard ERC-20 tokens that do not return a value. See here: https://medium.com/coinmonks/missing-return-value-bug-at-least-130-tokens-affected-d67bf08521ca
    **/
  function doTransferOut(IERC20NonStandard asset, address to, uint amount) internal returns (bool) {
      asset.transfer(to, amount);

      bool success;
      assembly {
          switch returndatasize()
              case 0 {                      // This is a non-standard ERC-20
                  success := not(0)          // set success to true
              }
              case 32 {                     // This is a compliant ERC-20
                  returndatacopy(0, 0, 32)
                  success := mload(0)        // Set `success = returndata` of override external call
              }
              default {                     // This is an excessively non-compliant ERC-20, revert.
                  revert(0, 0)
              }
      }
      return success;
  }

  /**
   * @notice Sends any tokens in this contract to the sweepee address. This contract should never hold tokens, so this is just to fix any anomalistic situations where tokens end up locked in the contract.
   * @param token The token to sweep
   **/
  function sweep(IERC20NonStandard token) external {
    // **REQUIRE** `inMigration == 0`
    if (inMigration != 0) {
      revert Reentrancy(2);
    }

    // **WHEN** `token == 0x0000000000000000000000000000000000000000`:
    if (token == IERC20NonStandard(0x0000000000000000000000000000000000000000)) {
      // **EXEC** `sweepee.send(address(this).balance)`
      if (!sweepee.send(address(this).balance)) {
        revert SweepFailure(0);
      }
    } else {
      // **CALL** `token.transfer(sweepee, token.balanceOf(address(this)))`
      if (!doTransferOut(token, sweepee, token.balanceOf(address(this)))) {
        revert SweepFailure(1);
      }
    }
  }

  receive() external payable {
    // NO-OP
  }
}
