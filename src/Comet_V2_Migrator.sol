// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import "./vendor/@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3FlashCallback.sol";
import "./vendor/@uniswap/v3-periphery/contracts/base/PeripheryPayments.sol";
import "./vendor/@uniswap/v3-periphery/contracts/base/PeripheryImmutableState.sol";
import "./vendor/@uniswap/v3-periphery/contracts/libraries/PoolAddress.sol";
import "./vendor/@uniswap/v3-periphery/contracts/libraries/CallbackValidation.sol";
import "./vendor/@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import "./vendor/@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "./vendor/@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/CTokenInterface.sol";
import "./interfaces/CometInterface.sol";

/**
 * @title Compound Migrate V2 USDC to V3 USDC
 * @notice A contract to help migrate a Compound v2 position where a user is borrowing USDC, to a similar Compound v3 position.
 * @author Compound
 */
contract Comet_V2_Migrator is IUniswapV3FlashCallback, PeripheryImmutableState, PeripheryPayments {
  /** Events **/
  // event Absorb(address indexed initiator, address[] accounts);

  /// @notice Represents a given amount of collateral to migrate.
  struct Collateral {
    CTokenLike cToken;
    uint256 amount;
  }

  /// @notice Represents all data required to continue operation after a flash loan is initiated.
  struct MigrationCallbackData {
    address user;
    uint256 repayAmountActual;
    uint256 repayBorrowBehalf;
    Collateral[] collateral;
  }

  /// @notice The Comet Ethereum mainnet USDC contract
  Comet public immutable comet;

  /// @notice The Uniswap pool used by this contract to source liquidity (i.e. flash loans).
  IUniswapV3Pool public immutable uniswapLiquidityPool;

  /// @notice True if borrow token is token 0 in the Uniswap liquidity pool, otherwise false if token 1.
  bool public immutable uniswapLiquidityPoolToken0;

  /// @notice Fee for a flash loan from the liquidity pool as a fixed decimal (e.g. `0.001e18 = 0.1%`)
  uint256 public immutable uniswapLiquidityPoolFee;

  /// @notice A list of valid collateral tokens
  IERC20[] public collateralTokens;

  /// @notice The Compound II market for the borrowed token (e.g. `cUSDC`).
  CErc20 public immutable borrowCToken; 

  /// @notice The underlying borrow token (e.g. `USDC`).
  IERC20 public immutable borrowToken;

  /// @notice Address to send swept tokens to, if for any reason they remain locked in this contract.
  address public immutable sweepee;

  /**
   * @notice Construct a new Compound_Migrate_V2_USDC_to_V3_USDC
   * @param comet_ The Comet Ethereum mainnet USDC contract.
   * @param uniswapLiquidityPool_ The Uniswap pool used by this contract to source liquidity (i.e. flash loans).
   * @param collateralTokens_ A list of valid collateral tokens
   * @param borrowCToken_ The Compound II market for the borrowed token (e.g. `cUSDC`).
   **/
  constructor(
    Comet comet_,
    CErc20 borrowCToken_,
    IUniswapV3Pool uniswapLiquidityPool_,
    IERC20[] memory collateralTokens_,
    address sweepee_,
    address _factory, // TODO
    address _WETH9 // TODO
  ) PeripheryImmutableState(_factory, _WETH9) {
    comet = comet_;
    borrowCToken = borrowCToken_;
    borrowToken = borrowCToken_.underlying();
    uniswapLiquidityPool = uniswapLiquidityPool_;
    uniswapLiquidityPoolFee = uniswapLiquidityPool.fee();
    uniswapLiquidityPoolToken0 = uniswapLiquidityPool.token0() == address(borrowToken);
    sweepee = sweepee_;
    for (uint8 i = 0; i < collateralTokens_.length; i++) {
      collateralTokens.push(collateralTokens_[i]);
    }
  }

  /**
   * @notice This is the core function of this contract, migrating a position from Compound II to Compound III. We use a flash loan from Uniswap to provide liquidity to move the position.
   * @param collateral Array of collateral to transfer into Compound III. See notes below.
   * @param borrowAmount Amount of borrow to migrate (i.e. close in Compound II, and borrow from Compound III). See notes below.
   * @dev **N.B.** Collateral requirements may be different in Compound II and Compound III. This may lead to a migration failing or being less collateralized after the migration. There are fees associated with the flash loan, which may affect position or cause migration to fail.
   * @dev Note: each `collateral` market must exist in `collateralTokens` array, defined on contract creation.
   * @dev Note: each `collateral` market must be supported in Compound III.
   * @dev Note: `collateral` amounts of 0 are strictly ignored. Collateral amounts of max uint256 are set to the user's current balance.
   * @dev Note: `borrowAmount` may be set to max uint256 to migrate the entire current borrow balance.
   **/
  function migrate(Collateral[] calldata collateral, uint256 borrowAmount) external {

  }

  /**
   * @notice This function handles a callback from the Uniswap Liquidity Pool after it has sent this contract the requested tokens. We are responsible for repaying those tokens, with a fee, before we return from this function call.
   * @param fee0 The fee for borrowing token0 from pool. Ingored.
   * @param fee1 The fee for borrowing token1 from pool. Ingored.
   * @param data The data encoded above, which is the ABI-encoding of XXX.
   **/
  function uniswapV3FlashCallback(uint256 fee0, uint256 fee1, bytes calldata data) external {

  }

  /**
   * @notice Sends any tokens in this contract to the sweepee address. This contract should never hold tokens, so this is just to fix any anomalistic situations where tokens end up locked in the contract.
   * @param token The token to sweep
   **/
  function sweep(IERC20 token) external {

  }
}