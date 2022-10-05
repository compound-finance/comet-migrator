// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import "./vendor/@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3FlashCallback.sol";
import "./vendor/@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "./vendor/@uniswap/v3-periphery/contracts/libraries/PoolAddress.sol";
import "./vendor/@uniswap/v3-periphery/contracts/libraries/CallbackValidation.sol";
import "./vendor/@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IWETH9.sol";
import "./interfaces/CTokenInterface.sol";
import "./interfaces/CometInterface.sol";
import "forge-std/console.sol";

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
    TokenRepaid[] tokensRepaid,
    uint256 borrowAmountWithFee);

  /// @notice Represents a given amount of collateral to migrate.
  struct Collateral {
    CTokenLike cToken;
    uint256 amount;
  }

  struct UniswapPoolInfo {
    address token0;
    address token1;
    uint24 fee;
  }

  struct BorrowData {
    CErc20 borrowCToken; // XXX how would we adapt this for other sources?
    uint256 borrowAmount;
    // XXX apparently, the same pool can only be swapped/loaned from once per txn...they have a lock
    // It's safer to have the input be pool info instead of the pool address itself
    UniswapPoolInfo poolInfo;
    bool isFlashLoan; // as opposed to flash swap
  }

  struct TokenRepaid {
    address borrowToken; // underlying token that is borrowed
    uint256 repayAmount; // amount repaid
  }

  /// @notice Represents all data required to continue operation after a flash loan is initiated.
  struct MigrationCallbackData {
    address user;
    BorrowData[] borrowData;
    Collateral[] collateral;
    TokenRepaid[] tokensRepaid; // solely used for generating the `Migrated` event
    address baseToken;
    uint256 totalBaseToBorrow;
    uint256 step;
  }

  /// @notice The Comet Ethereum mainnet USDC contract
  Comet public immutable comet;

  /// @notice A list of valid collateral tokens
  IERC20[] public collateralTokens;

  /// @notice The address of the `cETH` token
  CTokenLike public immutable cETH;

  /// @notice The address of the `weth` token
  IWETH9 public immutable weth;

  /// @notice The Uniswap V3 pools factory contract address
  address public immutable factory;

  /// @notice Address to send swept tokens to, if for any reason they remain locked in this contract
  address payable public immutable sweepee;

  /// @notice A rëentrancy guard.
  uint public inMigration;

  // Taken from @uniswap/v3-core/contracts/library/TickMath.sol
  /// @dev The minimum value that can be returned from #getSqrtRatioAtTick. Equivalent to getSqrtRatioAtTick(MIN_TICK)
  uint160 internal constant MIN_SQRT_RATIO = 4295128739;

  /// @dev The maximum value that can be returned from #getSqrtRatioAtTick. Equivalent to getSqrtRatioAtTick(MAX_TICK)
  uint160 internal constant MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342;

  /**
   * @notice Construct a new Compound_Migrate_V2_USDC_to_V3_USDC
   * @param comet_ The Comet Ethereum mainnet USDC contract.
   * @param cETH_ The address of the `cETH` token.
   * @param weth_ The address of the `WETH9` token.
   * @param factory_ The address of the Uniswap V3 pools factory contract.
   * @param sweepee_ Sweep excess tokens to this address.
   **/
  constructor(
    Comet comet_,
    CTokenLike cETH_,
    IWETH9 weth_,
    address factory_,
    address payable sweepee_
  ) payable {
    // **WRITE IMMUTABLE** `comet = comet_`
    comet = comet_;

    // **WRITE IMMUTABLE** `cETH = cETH_`
    cETH = cETH_;

    // **WRITE IMMUTABLE** `weth = weth_`
    weth = weth_;

    factory = factory_;

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
  function migrate(Collateral[] calldata collateral, BorrowData[] memory borrowData, address baseToken) external {
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
    uint256 step = 0;
    TokenRepaid[] memory tokensRepaid = new TokenRepaid[](borrowData.length);
    bytes memory callbackData = abi.encode(MigrationCallbackData({
      user: user,
      borrowData: borrowData,
      collateral: collateral,
      tokensRepaid: tokensRepaid,
      baseToken: baseToken,
      totalBaseToBorrow: 0,
      step: step
    }));

    flashLoanOrSwap(borrowData, step, callbackData);

    // **STORE** `inMigration -= 1`
    inMigration -= 1;
  }

  // XXX borrowData already exists in callbackData, so see if we can optimize a bit
  function flashLoanOrSwap(BorrowData[] memory borrowData, uint256 step, bytes memory callbackData) internal {
    // XXX assert that borrowData[step] is within range
    BorrowData memory initialBorrowData = borrowData[step];
    IERC20NonStandard borrowToken = initialBorrowData.borrowCToken.underlying();
    UniswapPoolInfo memory poolInfo = initialBorrowData.poolInfo;
    IUniswapV3Pool pool = getPool(poolInfo.token0, poolInfo.token1, poolInfo.fee);
    bool isPoolToken0 = pool.token0() == address(borrowToken);
    uint repayAmount = initialBorrowData.borrowAmount;
    if (initialBorrowData.isFlashLoan) {
      // **CALL** `uniswapLiquidityPool.flash(address(this), uniswapLiquidityPoolToken0 ? repayAmount : 0, uniswapLiquidityPoolToken0 ? 0 : repayAmount, data)`
      pool.flash(address(this), isPoolToken0 ? repayAmount : 0, isPoolToken0 ? 0 : repayAmount, callbackData);
    } else {
      bool zeroForOne = !isPoolToken0;
      // Allow for max slippage
      uint160 sqrtPriceLimitX96 = zeroForOne ? MIN_SQRT_RATIO + 1 : MAX_SQRT_RATIO - 1;
      pool.swap(
          address(this),
          !isPoolToken0,
          -int256(repayAmount), // XXX need to do safe convert
          sqrtPriceLimitX96,
          callbackData
      );
    }
  }

  /// @dev Returns the pool for the given token pair and fee. The pool contract may or may not exist.
  function getPool(
      address tokenA,
      address tokenB,
      uint24 fee
  ) private view returns (IUniswapV3Pool) {
      return IUniswapV3Pool(PoolAddress.computeAddress(factory, PoolAddress.getPoolKey(tokenA, tokenB, fee)));
  }

  /**
   * @notice This function handles a callback from the Uniswap Liquidity Pool after it has sent this contract the requested tokens. We are responsible for repaying those tokens, with a fee, before we return from this function call.
   * @param fee0 The fee for borrowing token0 from pool.
   * @param fee1 The fee for borrowing token1 from pool.
   * @param data The data encoded above, which is the ABI-encoding of XXX.
   **/
   // XXX only withdraw collateral on last, when borrowdata is empty (or length of 1?)
  function uniswapV3FlashCallback(uint256 fee0, uint256 fee1, bytes calldata data) external {
    handleUniswapCallback(data, true, fee0, fee1);
  }

  function uniswapV3SwapCallback(
    int256 amount0Delta,
    int256 amount1Delta,
    bytes calldata data
  ) external {
    // XXX do safe conversion from int to uint, one with be negative, but we only care about the positive one
    handleUniswapCallback(data, false, uint256(amount0Delta), uint256(amount1Delta));
  }

  function handleUniswapCallback(bytes calldata data, bool isFlashCallback, uint256 amount0, uint256 amount1) internal {
    // **REQUIRE** `inMigration == 1`
    if (inMigration != 1) {
      revert Reentrancy(1);
    }

    MigrationCallbackData memory migrationCallbackData = abi.decode(data, (MigrationCallbackData));
    BorrowData memory currentBorrowData = migrationCallbackData.borrowData[migrationCallbackData.step];
    UniswapPoolInfo memory poolInfo = currentBorrowData.poolInfo;

    // **REQUIRE** `msg.sender == uniswapLiquidityPool`
    IUniswapV3Pool pool = getPool(poolInfo.token0, poolInfo.token1, poolInfo.fee);
    require(msg.sender == address(pool), "must be called from uniswapLiquidityPool");

    // We use NonStandard here for tokens like USDT which do not return a boolean on approve
    // XXX Properly handle non standard ERC20 tokens
    IERC20NonStandard borrowToken = currentBorrowData.borrowCToken.underlying(); // XXX gassy, should just pass in as calldata from migrate()

    // **BIND** `MigrationCallbackData{user, repayAmountActual, borrowAmountTotal, collateral} = abi.decode(data, (MigrationCallbackData))`
    // MigrationCallbackData memory migrationData = abi.decode(data, (MigrationCallbackData));

    // **BIND** `borrowAmountWithFee = repayAmount + uniswapLiquidityPoolToken0 ? fee0 : fee1`
    uint repayAmount = currentBorrowData.borrowAmount;
    bool isPoolToken0 = pool.token0() == address(borrowToken);
    uint256 borrowAmountWithFee;
    if (isFlashCallback) {
      borrowAmountWithFee = repayAmount + ( isPoolToken0 ? amount0 : amount1 );
    } else {
      // Note: The token that's not the borrowToken will always be base here
      // XXX be clear this is borrow amount for base (USDC)
      // XXX do safe conversion from int to uint
      borrowAmountWithFee = uint256(isPoolToken0 ? amount1 : amount0);
    }
    uint256 totalBorrowAmount = migrationCallbackData.totalBaseToBorrow + borrowAmountWithFee;

    // **CALL** `borrowCToken.repayBorrowBehalf(user, repayAmountActual)`
	  console.logAddress(address(borrowToken));
    // XXX USDT `approve` does not return boolean, could this be why this is failing for USDT?
    borrowToken.approve(address(currentBorrowData.borrowCToken), type(uint256).max);
    console.logAddress(address(currentBorrowData.borrowCToken));
    uint256 err = currentBorrowData.borrowCToken.repayBorrowBehalf(migrationCallbackData.user, repayAmount);
    if (err != 0) {
      revert CompoundV2Error(0, err);
    }
    // Update `tokensRepaid`
    migrationCallbackData.tokensRepaid[migrationCallbackData.step] = TokenRepaid({
      borrowToken: address(borrowToken),
      repayAmount: repayAmount
    });

    // If not the last step, trigger another flash swap/loan to repay more borrows
    // Otherwise, redeem collateral and borrow from v3 to repay loans
    bool isLastStep = migrationCallbackData.step >= migrationCallbackData.borrowData.length - 1;
    if (isLastStep) {
      migrateCollateralAndBorrow(migrationCallbackData, totalBorrowAmount);
    } else {
      uint256 nextStep = migrationCallbackData.step + 1;
      bytes memory callbackData = abi.encode(MigrationCallbackData({
        user: migrationCallbackData.user,
        borrowData: migrationCallbackData.borrowData,
        collateral: migrationCallbackData.collateral,
        tokensRepaid: migrationCallbackData.tokensRepaid,
        baseToken: migrationCallbackData.baseToken,
        totalBaseToBorrow: totalBorrowAmount,
        step: nextStep
      }));
      flashLoanOrSwap(migrationCallbackData.borrowData, nextStep, callbackData);
    }

    if (isFlashCallback) {
      // **CALL** `borrowToken.transfer(address(uniswapLiquidityPool), borrowAmountWithFee)`
      // IMPORTANT: We only pay back `borrowAmountWithFee` to Uniswap pool rather than `totalAmount`
      borrowToken.transfer(address(pool), borrowAmountWithFee);
    } else {
      // XXX can also just always set `repayToken` as the `baseToken` (is that a safe assumption?)
      IERC20 repayToken = IERC20(isPoolToken0 ? pool.token1() : pool.token0());
      repayToken.transfer(address(pool), borrowAmountWithFee);
    }
  }

  function migrateCollateralAndBorrow(MigrationCallbackData memory migrationData, uint256 borrowAmountWithFee) internal {
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
    comet.withdrawFrom(migrationData.user, address(this), migrationData.baseToken, borrowAmountWithFee);

    // **EMIT** `Migrated(user, collateral, repayAmount, borrowAmountWithFee)`
    emit Migrated(migrationData.user, migrationData.collateral, migrationData.tokensRepaid, borrowAmountWithFee);
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
