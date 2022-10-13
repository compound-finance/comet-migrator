# Comet Migrator

The Comet Migrator v2 is a set of contracts to transfer one or more positions from [Compound II](https://v2-app.compound.finance) and other DeFi protocols to [Compound III](https://v3-app.compound.finance).

# Migration Spec CometMigrator

The CometMigrator contract is used to transfer any number of positions where a user is borrowing a token from Compound II, Aave, or Maker to a position where that user is now borrowing the base asset (e.g. USDC) in a Compound III deployment. We use a flash loan to facilitate the transition. Positions can be transferred in whole or in part.

## Knobs

Users can specify the following parameters, generally:

 - Collateral to transfer: A user may choose how much collateral to transfer, e.g. all of my UNI and part of my COMP.
 - Amount to repay: The user may choose how much to repay of USDC (e.g. all of it or 2000 USDC).
 - Position source: The user may specify which DeFi protocol (e.g. Compound II, Aave, Maker) a position currently lives on.
 - Max loan: The user may specify the max size of the flash loan to take when migrating positions. This can be used to prevent the user from paying too much slippage and fees during the Uniswap swaps.

## Contract Storage

 * `comet: Comet` **immutable**: The Comet Ethereum mainnet USDC contract.
 * `uniswapLiquidityPool: IUniswapV3Pool` **immutable**: The Uniswap pool used by this contract to source liquidity (i.e. flash loans).
 * `borrowCToken: CToken` **immutable**: The Compound II market for the borrowed token (e.g. `cUSDC`).
 * `swapRouter: ISwapRouter` **immutable**: The Uniswap router for facilitating token swaps.
 * `isUniswapLiquidityPoolToken0: boolean` **immutable**: True if borrow token is token 0 in the Uniswap liquidity pool, otherwise false if token 1.

 * `borrowToken: IERC20` **immutable**: The underlying borrow token (e.g. `USDC`).
 * `cETH: CToken` **immutable**: The address of the `cETH` token.
 * `weth: WETH9` **immutable**: The address of the `weth` token.
 * `aaveV2LendingPool: ILendingPool` **immutable**: The address of the Aave v2 LendingPool contract. This is the contract that all `withdraw` and `repay` transactions through.
 * `cdpManager: CDPManagerLike` **immutable**: The address of the Maker CDP Manager contract. This is used to manage CDP positions owned by the user.
 * `daiJoin: DaiJoin` **immutable**: The address of the DaiJoin contract used to deposit/withdraw DAI into the Maker system.
 * `dai: IERC20` **immutable**: The address of the `DAI` token.
 * `sweepee: address` **immutable**: Sweep excess tokens to this address.
 * `inMigration: uint256`: A reentrancy guard.

## Structs

### Compound II Positions

Represents a set of positions on Compound II to migrate:

```c
struct CompoundV2Position {
  CompoundV2Collateral[] collateral,
  CompoundV2Borrow[] borrows,
  bytes[] paths // empty path if no swap is required (e.g. repaying USDC borrow)
}
```

#### Collateral

Represents a given amount of collateral to migrate.

```c
struct CompoundV2Collateral {
  CToken cToken,
  uint256 amount // Note: amount of cToken
}
```

#### Borrow

Represents a given amount of borrow to migrate.

```c
struct CompoundV2Borrow {
  CToken cToken,
  uint256 amount // Note: amount of underlying
}
```

### Aave v2 Positions

Represents a set of positions on Aave V2 to migrate:

```c
struct AaveV2Position {
  AaveV2Collateral[] collateral,
  AaveV2Borrow[] borrows,
  bytes[] paths // empty path if no swap is required (e.g. repaying USDC borrow)
}
```

#### Collateral

Represents a given amount of collateral to migrate.

```c
struct AaveV2Collateral {
  AToken aToken,
  uint256 amount
}
```

#### Borrow

Represents a given amount of borrow to migrate.

```c
struct CompoundV2Borrow {
  CToken cToken,
  uint256 amount
}
```

### Aave v2 Positions

Represents a set of positions on Aave V2 to migrate:

```c
struct AvveV2Position {
  AaveV2Collateral[] collateral,
  AaveV2Borrow[] borrows,
  bytes[] paths // empty path if no swap is required (e.g. repaying USDC borrow)
}
```

#### Collateral

Represents a given amount of collateral to migrate.

```c
struct AaveV2Collateral {
  AToken asset,
  uint256 amount
}
```

#### Borrow

Represents a given amount of borrow to migrate.

```c
struct AaveV2Borrow {
  ADebtToken asset, // Note: Aave has two separate debt tokens per asset: stable and variable rate
  uint256 amount
}
```

### Maker Positions
Represents a CDP position on Maker to migrate:

```c
struct CDPPosition {
  uint256 cdpId,
  uint256 collateralAmount,
  uint256 borrowAmount,
  bytes path, // empty path if no swap is required (e.g. repaying USDC borrow)
  GemJoin gemJoin // the adapter contract for depositing/withdrawing collateral
}
```

### UniswapCallback

Represents all data required to continue operation after a flash loan is initiated.

```c
struct MigrationCallbackData {
  address user,
  uint256 flashAmount,
  CompoundV2Position compoundV2Position,
  AvveV2Position avveV2Position,
  CDPPosition[] cdpPositions 
}
```

## Events

```c
event Migrated(
  address indexed user,
  CompoundV2Position compoundV2Position,
  AaveV2Position aaveV2Position,
  CDPPosition[] cdpPositions,
  uint256 flashAmount,
  uint256 flashAmountWithFee)
```

## Contract Functions

### Constructor

This function describes the initialization process for this contract. We set the Compound III contract address and track valid collateral tokens.

#### Inputs

 * `comet_: Comet`: The Comet Ethereum mainnet USDC contract.
 * `borrowCToken_: CToken`: The Compound II market for the borrowed token (e.g. `cUSDC`).
 * `cETH_: CToken`: The address of the `cETH` token.
 * `weth_: IWETH9`: The address of the `WETH9` token.
 * `aaveV2LendingPool: ILendingPool`: The address of the Aave v2 LendingPool contract. This is the contract that all `withdraw` and `repay` transactions go through.
 * `cdpManager: CDPManagerLike`: The address of the Maker CDP Manager contract. This is used to manage CDP positions owned by the user.
 * `daiJoin: DaiJoin`: The address of the DaiJoin contract used to deposit/withdraw DAI into the Maker system.
 * `uniswapLiquidityPool_: IUniswapV3Pool` : The Uniswap pool used by this contract to source liquidity (i.e. flash loans).
 * `swapRouter_: ISwapRouter`: The Uniswap router for facilitating token swaps.
 * `sweepee_: address`: Sweep excess tokens to this address.

#### Function Spec

`function CometMigrator(Comet comet_, CToken borrowCToken_, CToken cETH_, WETH9 weth, ILendingPool aaveV2LendingPool_, CDPManagerLike cdpManager_, DaiJoin daiJoin_, UniswapV3Pool uniswapLiquidityPool_, ISwapRouter swapRouter_, address sweepee_) external`

 * **WRITE IMMUTABLE** `comet = comet_`
 * **WRITE IMMUTABLE** `borrowCToken = borrowCToken_`
 * **WRITE IMMUTABLE** `borrowToken = borrowCToken_.underlying()`
 * **WRITE IMMUTABLE** `cETH = cETH_`
 * **WRITE IMMUTABLE** `weth = weth_`
 * **WRITE IMMUTABLE** `aaveV2LendingPool = aaveV2LendingPool_`
 * **WRITE IMMUTABLE** `cdpManager = cdpManager_`
 * **WRITE IMMUTABLE** `daiJoin = daiJoin_`
 * **WRITE IMMUTABLE** `dai = daiJoin_.gem()`
 * **WRITE IMMUTABLE** `uniswapLiquidityPool = uniswapLiquidityPool_`
 * **WRITE IMMUTABLE** `isUniswapLiquidityPoolToken0 = uniswapLiquidityPool.token0() == borrowToken`
 * **REQUIRE** `isUniswapLiquidityPoolToken0 || uniswapLiquidityPool.token1() == borrowToken`
 * **WRITE IMMUTABLE** `swapRouter = swapRouter_`
 * **WRITE IMMUTABLE** `sweepee = sweepee_`
 * **CALL** `baseToken.approve(address(swapRouter), type(uint256).max)`

### Migrate Function

This is the core function of this contract, migrating a position from Compound II to Compound III. We use a flash loan from Uniswap to provide liquidity to move the position.

**N.B.** Collateral requirements may be different in Compound II and Compound III. This may lead to a migration failing or being less collateralized after the migration. There are fees associated with the flash loan, which may affect position or cause migration to fail.

#### Pre-conditions

Before calling this function, a user is required to:

 - a) Call `comet.allow(migrator, true)`
 - b) For each `{cToken, amount}` in `CompoundV2Position.collateral`, call `cToken.approve(migrator, amount)`.
 - c) For each `{aToken, amount}` in `AvveV2Position.collateral`, call `aToken.approve(migrator, amount)`.
 - d) For each `cdpId` in `CDPPosition`, call `cdpManager.cdpAllow(cdpId, migrator, 1)`.

Notes for (b):

 - allowance may be greater than `amount`, such as max uint256, but may not be less.
 - allowances are in native cToken, not underlying amounts.

#### Inputs

 * `compoundV2Position: CompoundV2Position` - Structure containing the user’s Compound V2 collateral and borrow positions to migrate to Compound III. See notes below.
 * `avveV2Position: AvveV2Position` - Structure containing the user’s Aave V2 collateral and borrow positions to migrate to Compound III. See notes below.
 * `cdpPositions: CDPPosition[]` - List of structures that each represent a single CDP’s collateral and borrow position to migrate to Compound III. See notes below.
 * `flashAmount: uint256` - Amount of base asset to borrow from the Uniswap flash loan to facilitate the migration. See notes below.

Notes:
 - Each `collateral` market must be supported in Compound III.
 - `collateral` amounts of 0 are strictly ignored. Collateral amounts of max uint256 are set to the user's current balance.
 - `flashAmount` is provided by the user as a hint to the Migrator to know the maximum expected cost (in terms of the base asset) of the migration. If `flashAmount` is less than the total amount needed to migrate the user’s positions, the transaction will revert.

#### Bindings

 * `user: address`: Alias for `msg.sender`
 * `data: bytes[]`: The ABI-encoding of the `MigrationCallbackData`, to be passed to the Uniswap Liquidity Pool Callback.

#### Function Spec

`function migrate(compoundV2Position: CompoundV2Position, avveV2Position: AvveV2Position, cdpPositions: CDPPosition[], flashAmount: uint256) external`

  - **REQUIRE** `inMigration == 0`
  - **STORE** `inMigration += 1`
  - **BIND** `user = msg.sender`
  - **REQUIRE** `compoundV2Position.borrows.length == compoundV2Position.paths.length`
  - **REQUIRE** `avveV2Position.borrows.length == avveV2Position.paths.length`

  - **BIND** `data = abi.encode(MigrationCallbackData{user, flashAmount, compoundV2Position, avveV2Position, makerPositions})`
  - **CALL** `uniswapLiquidityPool.flash(address(this), isUniswapLiquidityPoolToken0 ? flashAmount : 0, isUniswapLiquidityPoolToken0 ? 0 : flashAmount, data)`
  - **STORE** `inMigration -= 1`

Note: for fee calculation see [UniswapV3Pool](https://github.com/Uniswap/v3-core/blob/main/contracts/UniswapV3Pool.sol#L800).

### Uniswap Liquidity Pool Callback Function

This function handles a callback from the Uniswap Liquidity Pool after it has sent this contract the requested tokens. We are responsible for repaying those tokens, with a fee, before we return from this function call.

#### Pre-conditions

This function may only be called during a migration command. We check that the call originates from the expected Uniswap pool, and we check that we are actively processing a migration. This combination of events should ensure that no external party can trigger this code, though it's not clear it would be dangerous even if such a party did.

#### Inputs

 - `uint256 fee0`: The fee for borrowing token0 from pool.
 - `uint256 fee1`: The fee for borrowing token1 from pool.
 - `calldata data`: The data encoded above, which is the ABI-encoding of `MigrationCallbackData`.

#### Bindings

 * `user: address`: Alias for `msg.sender`
 * `flashAmount: uint256`: The amount of base asset borrowed as part of the Uniswap flash loan.
 * `flashAmountWithFee: uint256`: The amount to borrow from Compound III to pay back the flash loan, accounting for fees.
 * `compoundV2Position: CompoundV2Position`: Structure containing the user’s Compound V2 collateral and borrow positions to migrate to Compound III. Array of collateral to transfer into Compound III.
 * `avveV2Position: AvveV2Position`: Structure containing the user’s Aave V2 collateral and borrow positions to migrate to Compound III.
 * `cdpPositions: CDPPosition[]`: List of structures that each represent a single CDP’s collateral and borrow position to migrate to Compound III.
 * `underlying: IERC20` - The underlying of a cToken, or `weth` in the case of `cETH`.

#### Function Spec

`function uniswapV3FlashCallback(uint256 fee0, uint256 fee1, bytes calldata data)`

  - **REQUIRE** `inMigration == 1`
  - **REQUIRE** `msg.sender == uniswapLiquidityPool`
  - **BIND** `MigrationCallbackData{user, flashAmount, compoundV2Position, avveV2Position, cdpPositions} = abi.decode(data, (MigrationCallbackData))`
  - **BIND** `flashAmountWithFee = flashAmount + isUniswapLiquidityPoolToken0 ? fee0 : fee1`
  - **EXEC** `migrateCompoundV2Position(user, compoundV2Position)`
  - **EXEC** `migrateAvveV2Position(user, avveV2Position)`
  - **EXEC** `migrateCdpPositions(user, cdpPositions)`
  - **CALL** `comet.withdrawFrom(user, address(this), borrowToken, flashAmountWithFee - borrowToken.balanceOf(address(this)))`
  - **CALL** `borrowToken.transfer(address(uniswapLiquidityPool), flashAmountWithFee)`
  - **EMIT** `Migrated(user, compoundV2Position, aaveV2Position, cdpPositions, flashAmount, flashAmountWithFee)`

### Migrate Compound V2 Position Function

This internal helper function repays the user’s borrow positions on Compound V2 (executing swaps first if necessary) before migrating their collateral over to Compound III.

#### Inputs

 - `address user`: Alias for the `msg.sender` of the original `migrate` call
 - `compoundV2Position CompoundV2Position` - Structure containing the user’s Compound V2 collateral and borrow positions to migrate to Compound III.

#### Bindings

 * `user: address`: Alias for `msg.sender`
 * `repayAmount: uint256`: The amount to repay for each borrow position.
 * `underlying: IERC20` - The underlying of a cToken, or `weth` in the case of `cETH`.

#### Function Spec

`function migrateCompoundV2Position(address user, CompoundV2Position position) internal`

  - **FOREACH** `(cToken, borrowAmount): CompoundV2Borrow, path: bytes` in `position`:
    - **WHEN** `borrowAmount == type(uint256).max)`:
      - **BIND READ** `repayAmount = cToken.borrowBalanceCurrent(user)`
    - **ELSE**
      - **BIND** `repayAmount = borrowAmount`
    - **WHEN** `path.length > 0`:
      - **CALL** `ISwapRouter.exactOutput(ExactOutputParams({path: path, recipient: address(this), amountOut: repayAmount, amountInMaximum: type(uint256).max})`
    - **CALL** `cToken.repayBorrowBehalf(user, repayAmount)`
  - **FOREACH** `(cToken, amount): CompoundV2Collateral` in `position.collateral`:
    - **CALL** `cToken.transferFrom(user, address(this), amount == type(uint256).max ? cToken.balanceOf(user) : amount)`
    - **CALL** `cToken.redeem(cToken.balanceOf(address(this)))`
    - **WHEN** `cToken == cETH`:
      - **CALL** `weth.deposit{value: address(this).balance}()`
      - **BIND** `underlying = weth`
    - **ELSE**
      - **BIND READ** `underlying = cToken.underlying()`
    - **CALL** `underlying.approve(address(comet), type(uint256).max)`
    - **CALL** `comet.supplyTo(user, underlying, underlying.balanceOf(address(this)))`

### Migrate Aave V2 Position Function

This internal helper function repays the user’s borrow positions on Aave V2 (executing swaps first if necessary) before migrating their collateral over to Compound III.

#### Inputs

 - `address user`: Alias for the `msg.sender` of the original `migrate` call
 - `avveV2Position AvveV2Position` - Structure containing the user’s Aave V2 collateral and borrow positions to migrate to Compound III.

#### Bindings

 * `user: address`: Alias for `msg.sender`
 * `repayAmount: uint256`: The amount to repay for each borrow position.
 * `rateMode: uint256`: The rate mode for the current borrow. 1 for stable, 2 for variable.
 * `underlyingDebt: IERC20` - The underlying asset of an Aave debt token.
 * `underlyingCollateral: IERC20` - The underlying asset of an Aave aToken. No special handling needed for ETH because Aave v2 uses WETH.

#### Function Spec

`function migrateAvveV2Position(address user, AvveV2Position position) internal`

  - **FOREACH** `(aDebtToken, borrowAmount): AaveV2Borrow, path: bytes` in `position`:
    - **WHEN** `borrowAmount == type(uint256).max)`:
      - **BIND READ** `repayAmount = aDebtToken.balanceOf(user)`
    - **ELSE**
      - **BIND** `repayAmount = borrowAmount`
    - **WHEN** `path.length > 0`:
      - **CALL** `ISwapRouter.exactOutput(ExactOutputParams({path: path, recipient: address(this), amountOut: repayAmount, amountInMaximum: type(uint256).max})`
    - **BIND READ** `underlyingDebt = aDebtToken.UNDERLYING_ASSET_ADDRESS()`
    - **BIND READ** `rateMode = aDebtToken.DEBT_TOKEN_REVISION()`
    - **CALL** `aaveV2LendingPool.repay(underlyingDebt, repayAmount, rateMode, user)`
  - **FOREACH** `(aToken, amount): AaveV2Collateral` in `position.collateral`:
    - **CALL** `aToken.transferFrom(user, address(this), amount == type(uint256).max ? aToken.balanceOf(user) : amount)`
    - **BIND READ** `underlyingCollateral = aToken.UNDERLYING_ASSET_ADDRESS()`
    - **CALL** `aaveV2LendingPool.withdraw(underlyingCollateral, aToken.balanceOf(address(this)), address(this))`
    - **CALL** `underlyingCollateral.approve(address(comet), type(uint256).max)`
    - **CALL** `comet.supplyTo(user, underlying, underlying.balanceOf(address(this)))`

### Migrate Maker CDP Positions Function

This internal helper function repays the user’s borrow positions on Maker (executing swaps first if necessary) before migrating their collateral over to Compound III.

#### Inputs

 - `address user`: Alias for the `msg.sender` of the original `migrate` call
 - `cdpPositions CDPPosition[]` - List of structures that each represent a single CDP’s collateral and borrow position to migrate to Compound III.

#### Bindings

 * `user: address`: Alias for `msg.sender`.
 * `withdrawAmount: uint256`: The amount of collateral to withdraw.
 * `withdrawAmount18: uint256`: The amount of collateral to withdraw, scaled up to 18 decimals.
 * `repayAmount: uint256`: The amount to repay for each borrow position.
 * `underlyingDebt: IERC20` - The underlying asset of an Aave debt token.
 * `underlyingCollateral: IERC20` - The underlying asset of an Aave aToken. No special handling needed for ETH because Aave v2 uses WETH.

#### Function Spec

`function migrateCDPPositions(address user, CDPPosition[] positions) internal`
  - **FOREACH** `(cdpId, borrowAmount, collateralAmount, path, gemJoin): CDPPosition` in `positions`:
    - **WHEN** `borrowAmount == type(uint256).max) || collateralAmount == type(uint256).max`:
      - **BIND READ** `(withdrawAmount18, repayAmount) = cdpManager.vat().urns(cdpManager.ilks(cdpId), cdpManager.urns(cdpId))`
      - **BIND** `withdrawAmount = withdrawAmount18 / (10 ** (18 - gemJoin.dec()))`
    - **WHEN** `borrowAmount != type(uint256).max`
      - **BIND** `repayAmount = borrowAmount`
    - **WHEN** `collateralAmount != type(uint256).max`
      - **BIND** `withdrawAmount = collateralAmount`
      - **BIND** `withdrawAmount18 = collateralAmount * (10 ** (18 - gemJoin.dec()))`
    - **WHEN** `path.length > 0`:
      - **CALL** `ISwapRouter.exactOutput(ExactOutputParams({path: path, recipient: address(this), amountOut: repayAmount, amountInMaximum: type(uint256).max})`
    - **CALL** `dai.approve(daiJoin, repayAmount)`
    - **CALL** `daiJoin.join(cdpManager.urns(cdpId), repayAmount)`
    - **CALL** `cdpManager.frob(cdpId, 0, -repayAmount)`
    - **CALL** `cdpManager.frob(cdpId, -withdrawAmount18, 0)`
    - **CALL** `cdpManager.flux(cdpId, address(this), withdrawAmount18)`
    - **CALL** `gemJoin.exit(address(this), withdrawAmount)`
    - **BIND READ** `underlyingCollateral = gemJoin.gem()`
    - **CALL** `underlyingCollateral.approve(address(comet), type(uint256).max)`
    - **CALL** `comet.supplyTo(user, underlying, underlying.balanceOf(address(this)))`

    
### Sweep Function

Sends any tokens in this contract to the sweepee address. This contract should never hold tokens, so this is just to fix any anomalistic situations where tokens end up locked in the contract.

#### Inputs

 - `token: IERC20`: The token to sweep, or zero to sweep Ether

#### Function Spec

`function sweep(IERC20 token)`

  - **REQUIRE** `inMigration == 0`
  - **WHEN** `token == 0x0000000000000000000000000000000000000000`:
	- **EXEC** `sweepee.send(address(this).balance)`
  - **ELSE**
	- **CALL** `token.transfer(sweepee, token.balanceOf(address(this)))`


