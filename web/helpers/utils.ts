import { BaseAssetWithAccountState, ProtocolAndAccountState } from '@compound-finance/comet-extension/dist/CometState';
import { Contract } from '@ethersproject/contracts';
import { TransactionResponse } from '@ethersproject/providers';
import { Protocol } from '@uniswap/router-sdk';
import { CurrencyAmount, Percent, Token, TradeType } from '@uniswap/sdk-core';
import { AlphaRouter, SwapType, V3Route } from '@uniswap/smart-order-router';
import { encodeRouteToPath } from '@uniswap/v3-sdk';

import { MigrateBorrowTokenState, MigrateCollateralTokenState, MigrationSource, StateType, SwapInfo } from '../types';

import {
  BASE_FACTOR,
  amountToWei,
  getRiskLevelAndPercentage,
  formatTokenBalance,
  maybeBigIntFromString,
  parseNumber,
  MAX_UINT256,
  PRICE_PRECISION,
  SLIPPAGE_TOLERANCE,
  FACTOR_PRECISION,
  MeterRiskLevel
} from './numbers';

export const mainnetCompoundTokens = [
  'cZRX',
  'cWBTC',
  'cWBTC2',
  'cUSDT',
  'cUSDC',
  'cETH',
  'cREP',
  'cBAT',
  'cCOMP',
  'cLINK',
  'cUNI',
  'cDAI',
  'cTUSD',
  'cSUSHI',
  'cAAVE',
  'cYFI',
  'cMKR',
  'cUSDP'
] as const;

export const mainnetAaveTokens = [
  'aUSDT',
  'aWBTC',
  'aWETH',
  'aYFI',
  'aZRX',
  'aUNI',
  'aAAVE',
  'aBAT',
  'aBUSD',
  'aDAI',
  'aENJ',
  'aKNC',
  'aLINK',
  'aMANA',
  'aMKR',
  'aREN',
  'aSNX',
  'aSUSD',
  'aTUSD',
  'aUSDC',
  'aCRV',
  'aGUSD',
  'aBAL',
  'aXSUSHI',
  'aRENFIL',
  'aRAI',
  'aAMPL',
  'aUSDP',
  'aDPI',
  'aFRAX',
  'aFEI',
  'aENS',
  'aSTETH'
] as const;

export const stableCoins = ['USDC', 'USDT', 'DAI', 'BUSD', 'SUSD', 'TUSD', 'GUSD', 'USDP', 'RAI'] as const;

export function getDocument(f: (document: Document) => void) {
  if (document.readyState !== 'loading') {
    f(document);
  } else {
    window.addEventListener('DOMContentLoaded', _event => {
      f(document);
    });
  }
}

export function migratorTrxKey(migratorAddress: string): string {
  return `migrate_${migratorAddress}`;
}

export function tokenApproveTrxKey(tokenAddress: string, approveAddress: string): string {
  return `approve_${tokenAddress}_${approveAddress}`;
}

export function migrationSourceToDisplayString(migrationSource: MigrationSource): string {
  switch (migrationSource) {
    case MigrationSource.AaveV2:
      return 'Aave V2';
    case MigrationSource.CompoundV2:
      return 'Compound V2';
  }
}

type DataToFormatArgs = {
  borrowTokens: MigrateBorrowTokenState[];
  collateralTokens: MigrateCollateralTokenState[];
  cometData: ProtocolAndAccountState;
};

type FormattedMigratorData = {
  displayV2BorrowValue: string;
  displayV2CollateralValue: string;
  displayV2UnsupportedBorrowValue: string;
  displayV2UnsupportedCollateralValue: string;
  displayV2BorrowCapacity: string;
  displayV2AvailableToBorrow: string;
  displayV3BorrowValue: string;
  displayV3CollateralValue: string;
  displayV3BorrowCapacity: string;
  displayV3AvailableToBorrow: string;
  hasMigratePosition: boolean;
  v2BorrowCapacity: bigint;
  v2BorrowValue: bigint;
  v2RiskLevel: MeterRiskLevel;
  v2RiskPercentage: number;
  v2RiskPercentageFill: string;
  v2ToV3MigrateBorrowValue: bigint;
  v2UnsupportedBorrowValue: bigint;
  v2UnsupportedCollateralValue: bigint;
  v3BorrowCapacityValue: bigint;
  v3BorrowValue: bigint;
  v3RiskLevel: MeterRiskLevel;
  v3RiskPercentage: number;
  v3RiskPercentageFill: string;
  displayV3LiquidationPoint: string;
};

export function getFormattedDisplayData({
  borrowTokens,
  collateralTokens,
  cometData
}: DataToFormatArgs): FormattedMigratorData {
  const v2BorrowValue = borrowTokens.reduce((acc, { borrowBalance, underlying, price, repayAmount }) => {
    const maybeRepayAmount =
      repayAmount === 'max' ? borrowBalance : maybeBigIntFromString(repayAmount, underlying.decimals);
    const repayAmountBigInt =
      maybeRepayAmount === undefined ? 0n : maybeRepayAmount > borrowBalance ? borrowBalance : maybeRepayAmount;
    return acc + ((borrowBalance - repayAmountBigInt) * price) / BigInt(10 ** underlying.decimals);
  }, BigInt(0));
  const displayV2BorrowValue = formatTokenBalance(PRICE_PRECISION, v2BorrowValue, false, true);

  const v2CollateralValue = collateralTokens.reduce((acc, { balanceUnderlying, underlying, price, transfer }) => {
    const maybeTransfer = transfer === 'max' ? balanceUnderlying : maybeBigIntFromString(transfer, underlying.decimals);
    const transferBigInt =
      maybeTransfer === undefined ? 0n : maybeTransfer > balanceUnderlying ? balanceUnderlying : maybeTransfer;
    return acc + ((balanceUnderlying - transferBigInt) * price) / BigInt(10 ** underlying.decimals);
  }, BigInt(0));
  const displayV2CollateralValue = formatTokenBalance(PRICE_PRECISION, v2CollateralValue, false, true);

  const v2UnsupportedBorrowValue = borrowTokens.reduce((acc, { borrowBalance, underlying, price }) => {
    const unsupported = borrowBalance > 0n && !stableCoins.find(coin => coin === underlying.symbol);
    const balance = unsupported ? borrowBalance : 0n;
    return acc + (balance * price) / BigInt(10 ** underlying.decimals);
  }, BigInt(0));
  const displayV2UnsupportedBorrowValue = formatTokenBalance(PRICE_PRECISION, v2UnsupportedBorrowValue, false, true);
  const v2UnsupportedCollateralValue = collateralTokens.reduce((acc, { balanceUnderlying, underlying, price }) => {
    const v3CollateralAsset = cometData.collateralAssets.find(asset => asset.symbol === underlying.symbol);
    const balance =
      v3CollateralAsset === undefined && underlying.symbol !== cometData.baseAsset.symbol ? balanceUnderlying : 0n;
    return acc + (balance * price) / BigInt(10 ** underlying.decimals);
  }, BigInt(0));
  const displayV2UnsupportedCollateralValue = formatTokenBalance(
    PRICE_PRECISION,
    v2UnsupportedCollateralValue,
    false,
    true
  );

  const v2BorrowCapacity = collateralTokens.reduce(
    (acc, { balanceUnderlying, collateralFactor, price, transfer, underlying }) => {
      const maybeTransfer =
        transfer === 'max' ? balanceUnderlying : maybeBigIntFromString(transfer, underlying.decimals);
      const transferBigInt =
        maybeTransfer === undefined ? 0n : maybeTransfer > balanceUnderlying ? balanceUnderlying : maybeTransfer;
      const dollarValue = ((balanceUnderlying - transferBigInt) * price) / BigInt(10 ** underlying.decimals);
      const capacity = (dollarValue * collateralFactor) / BigInt(10 ** FACTOR_PRECISION);
      return acc + capacity;
    },
    BigInt(0)
  );
  const displayV2BorrowCapacity = formatTokenBalance(PRICE_PRECISION, v2BorrowCapacity, false, true);

  const v2AvailableToBorrow = v2BorrowCapacity - v2BorrowValue;
  const displayV2AvailableToBorrow = formatTokenBalance(PRICE_PRECISION, v2AvailableToBorrow, false, true);

  const v2ToV3MigrateBorrowValue = borrowTokens.reduce((acc, { borrowBalance, underlying, price, repayAmount }) => {
    const maybeRepayAmount =
      repayAmount === 'max' ? borrowBalance : maybeBigIntFromString(repayAmount, underlying.decimals);
    const repayAmountBigInt =
      maybeRepayAmount === undefined ? 0n : maybeRepayAmount > borrowBalance ? borrowBalance : maybeRepayAmount;
    return acc + (repayAmountBigInt * price) / BigInt(10 ** underlying.decimals);
  }, BigInt(0));
  const existingBorrowBalance = cometData.baseAsset.balance < 0n ? -cometData.baseAsset.balance : 0n;
  const existingBorrowValue: bigint =
    (existingBorrowBalance * cometData.baseAsset.price) / BigInt(10 ** cometData.baseAsset.decimals);
  const baseAssetTransferValue = collateralTokens.reduce((acc, { balanceUnderlying, underlying, price, transfer }) => {
    if (underlying.symbol === cometData.baseAsset.symbol) {
      const maybeTransfer =
        transfer === 'max' ? balanceUnderlying : maybeBigIntFromString(transfer, underlying.decimals);
      const transferBigInt =
        maybeTransfer === undefined ? 0n : maybeTransfer > balanceUnderlying ? balanceUnderlying : maybeTransfer;
      return acc + (transferBigInt * price) / BigInt(10 ** underlying.decimals);
    }
    return acc;
  }, BigInt(0));
  const v3BorrowValue = existingBorrowValue + v2ToV3MigrateBorrowValue - baseAssetTransferValue;

  const displayV3BorrowValue = formatTokenBalance(PRICE_PRECISION, v3BorrowValue, false, true);

  const v2ToV3MigrateCollateralValue = collateralTokens.reduce(
    (acc, { balanceUnderlying, underlying, price, transfer }) => {
      const maybeTransfer =
        transfer === 'max' ? balanceUnderlying : maybeBigIntFromString(transfer, underlying.decimals);
      const transferBigInt =
        maybeTransfer === undefined || underlying.symbol === cometData.baseAsset.symbol
          ? 0n
          : maybeTransfer > balanceUnderlying
          ? balanceUnderlying
          : maybeTransfer;
      return acc + (transferBigInt * price) / BigInt(10 ** underlying.decimals);
    },
    BigInt(0)
  );
  const v3CollateralValuePreMigrate = cometData.collateralAssets.reduce((acc, { balance, decimals, price }) => {
    return acc + (balance * price) / BigInt(10 ** decimals);
  }, BigInt(0));

  const v3CollateralValue = v2ToV3MigrateCollateralValue + v3CollateralValuePreMigrate;
  const displayV3CollateralValue = formatTokenBalance(PRICE_PRECISION, v3CollateralValue, false, true);

  const v3BorrowCapacityValue = cometData.collateralAssets.reduce(
    (acc, { balance, collateralFactor, decimals, price, symbol }) => {
      const filteredTokens = collateralTokens.filter(tokenState => tokenState.underlying.symbol === symbol);
      const transfer = filteredTokens.reduce((acc, tokenState) => {
        if (tokenState.transfer === 'max') {
          return acc + tokenState.balanceUnderlying;
        } else {
          const maybeTransfer = maybeBigIntFromString(tokenState.transfer, tokenState.underlying.decimals);
          return maybeTransfer === undefined
            ? acc
            : maybeTransfer > tokenState.balanceUnderlying
            ? acc + tokenState.balanceUnderlying
            : acc + maybeTransfer;
        }
      }, 0n);

      const dollarValue = ((balance + transfer) * price) / BigInt(10 ** decimals);
      const capacity = (dollarValue * collateralFactor) / BigInt(10 ** FACTOR_PRECISION);

      return acc + capacity;
    },
    BigInt(0)
  );
  const displayV3BorrowCapacity = formatTokenBalance(PRICE_PRECISION, v3BorrowCapacityValue, false, true);

  const v3LiquidationCapacityValue = cometData.collateralAssets.reduce(
    (acc, { balance, liquidateCollateralFactor, decimals, price, symbol }) => {
      const filteredTokens = collateralTokens.filter(tokenState => tokenState.underlying.symbol === symbol);
      const transfer = filteredTokens.reduce((acc, tokenState) => {
        if (tokenState.transfer === 'max') {
          return acc + tokenState.balanceUnderlying;
        } else {
          const maybeTransfer = maybeBigIntFromString(tokenState.transfer, tokenState.underlying.decimals);
          return maybeTransfer === undefined
            ? acc
            : maybeTransfer > tokenState.balanceUnderlying
            ? acc + tokenState.balanceUnderlying
            : acc + maybeTransfer;
        }
      }, 0n);

      const dollarValue = ((balance + transfer) * price) / BigInt(10 ** decimals);
      const capacity = (dollarValue * liquidateCollateralFactor) / BigInt(10 ** FACTOR_PRECISION);
      return acc + capacity;
    },
    BigInt(0)
  );

  const v3AvailableToBorrow = v3BorrowCapacityValue - v3BorrowValue;
  const displayV3AvailableToBorrow = formatTokenBalance(PRICE_PRECISION, v3AvailableToBorrow, false, true);

  const hasMigratePosition = v2ToV3MigrateBorrowValue > 0n || v2ToV3MigrateCollateralValue > 0n;

  const [v2RiskLevel, v2RiskPercentage, v2RiskPercentageFill] = getRiskLevelAndPercentage(
    v2BorrowValue,
    v2BorrowCapacity
  );
  const [v3RiskLevel, v3RiskPercentage, v3RiskPercentageFill] = getRiskLevelAndPercentage(
    v3BorrowValue,
    v3LiquidationCapacityValue
  );
  const v3LiquidationPoint = (v3CollateralValue * BigInt(Math.min(100, v3RiskPercentage))) / 100n;
  const displayV3LiquidationPoint = formatTokenBalance(PRICE_PRECISION, v3LiquidationPoint, false, true);

  return {
    displayV2BorrowValue,
    displayV2CollateralValue,
    displayV2UnsupportedBorrowValue,
    displayV2UnsupportedCollateralValue,
    displayV2BorrowCapacity,
    displayV2AvailableToBorrow,
    displayV3BorrowValue,
    displayV3CollateralValue,
    displayV3BorrowCapacity,
    displayV3AvailableToBorrow,
    hasMigratePosition,
    v2BorrowCapacity,
    v2BorrowValue,
    v2RiskLevel,
    v2RiskPercentage,
    v2RiskPercentageFill,
    v2ToV3MigrateBorrowValue,
    v2UnsupportedBorrowValue,
    v2UnsupportedCollateralValue,
    v3BorrowCapacityValue,
    v3BorrowValue,
    v3RiskLevel,
    v3RiskPercentage,
    v3RiskPercentageFill,
    displayV3LiquidationPoint
  };
}

export async function getRoute(
  networkId: number,
  migrator: string,
  baseAsset: BaseAssetWithAccountState,
  tokenState: MigrateBorrowTokenState,
  uniswapRouter: AlphaRouter,
  outputAmount: bigint
): Promise<SwapInfo | null> {
  const BASE_ASSET = new Token(networkId, baseAsset.address, baseAsset.decimals, baseAsset.symbol, baseAsset.name);
  const token = new Token(
    networkId,
    tokenState.underlying.address,
    tokenState.underlying.decimals,
    tokenState.underlying.symbol,
    tokenState.underlying.symbol
  );
  const amount = CurrencyAmount.fromRawAmount(token, outputAmount.toString());
  const route = await uniswapRouter.route(
    amount,
    BASE_ASSET,
    TradeType.EXACT_OUTPUT,
    {
      slippageTolerance: new Percent(SLIPPAGE_TOLERANCE.toString(), FACTOR_PRECISION.toString()),
      type: SwapType.SWAP_ROUTER_02,
      recipient: migrator,
      deadline: Math.floor(Date.now() / 1000 + 1800)
    },
    {
      protocols: [Protocol.V3],
      maxSplits: 1 // This only makes one path
    }
  );
  if (route !== null) {
    const swapInfo: SwapInfo = {
      tokenIn: {
        symbol: baseAsset.symbol,
        decimals: baseAsset.decimals,
        price: baseAsset.price,
        amount: BigInt(Number(route.quote.toFixed(baseAsset.decimals)) * 10 ** baseAsset.decimals)
      },
      tokenOut: {
        symbol: tokenState.underlying.symbol,
        decimals: tokenState.underlying.decimals,
        price: tokenState.price,
        amount: outputAmount
      },
      networkFee: `$${route.estimatedGasUsedUSD.toFixed(2)}`,
      path: encodeRouteToPath(route.route[0].route as V3Route, true)
    };
    return swapInfo;
  } else {
    return null;
  }
}

const ATokenKey = 'aToken' as const;
const ADebtTokenKey = 'aDebtToken' as const;
const CTokenKey = 'cToken' as const;

type CompoundBorrow = {
  cToken: string;
  amount: bigint;
};

type CompoundCollateral = {
  [CTokenKey]: string;
  amount: bigint;
};

type Swap = {
  path: string;
  amountInMaximum: bigint;
};

type AaveBorrow = {
  [ADebtTokenKey]: string;
  amount: bigint;
};

type AaveCollateral = {
  [ATokenKey]: string;
  amount: bigint;
};

type Borrow = AaveBorrow | CompoundBorrow;
type Collateral = AaveCollateral | CompoundCollateral;

type ValidateFormArgs = {
  borrowTokens: MigrateBorrowTokenState[];
  collateralTokens: MigrateCollateralTokenState[];
  cometData: ProtocolAndAccountState;
  migratorEnabled: boolean;
  migrationSource: MigrationSource;
  stateType: StateType;
  v2BorrowCapacity: bigint;
  v2BorrowValue: bigint;
  v2ToV3MigrateBorrowValue: bigint;
  v3BorrowCapacityValue: bigint;
  v3BorrowValue: bigint;
};

type MigrateParamas = [{ collateral: Collateral[]; borrows: Borrow[]; swaps: Swap[] }, bigint] | string | undefined;

export function validateForm({
  borrowTokens,
  collateralTokens,
  cometData,
  migratorEnabled,
  migrationSource,
  stateType,
  v2BorrowCapacity,
  v2BorrowValue,
  v2ToV3MigrateBorrowValue,
  v3BorrowCapacityValue,
  v3BorrowValue
}: ValidateFormArgs): MigrateParamas {
  if (stateType === StateType.Loading || !migratorEnabled) {
    return undefined;
  }

  const collateral: Collateral[] = [];
  for (let { address, balance, balanceUnderlying, underlying, transfer, exchangeRate } of collateralTokens) {
    const collateralAsset = cometData.collateralAssets.find(asset => asset.symbol === underlying.symbol);
    const isBaseAsset = underlying.symbol === cometData.baseAsset.symbol;
    const collateralKey = migrationSource === MigrationSource.AaveV2 ? ATokenKey : CTokenKey;

    if (!collateralAsset && !isBaseAsset) {
      continue;
    }

    if (transfer === 'max') {
      if (
        !isBaseAsset &&
        !!collateralAsset &&
        collateralAsset.totalSupply + balanceUnderlying > collateralAsset.supplyCap
      ) {
        return undefined;
      }

      collateral.push({
        [collateralKey]: address,
        amount: MAX_UINT256
      } as Collateral);
    } else if (transfer !== '') {
      const maybeTransfer = maybeBigIntFromString(transfer, underlying.decimals);
      if (maybeTransfer !== undefined && maybeTransfer > balanceUnderlying) {
        return undefined;
      } else if (
        maybeTransfer !== undefined &&
        !isBaseAsset &&
        !!collateralAsset &&
        collateralAsset.totalSupply + maybeTransfer > collateralAsset.supplyCap
      ) {
        return undefined;
      }

      const transferAmount = parseNumber(transfer, n =>
        amountToWei(
          exchangeRate === undefined ? n : (n * 10 ** FACTOR_PRECISION) / Number(exchangeRate),
          underlying.decimals
        )
      );
      if (transferAmount === null) {
        return undefined;
      } else {
        if (transferAmount > 0n) {
          collateral.push({
            [collateralKey]: address,
            amount: transferAmount
          } as Collateral);
        }
      }
    }
  }

  const borrows: Borrow[] = [];
  for (let { address, borrowBalance, underlying, repayAmount } of borrowTokens) {
    const borrowKey = migrationSource === MigrationSource.AaveV2 ? ADebtTokenKey : CTokenKey;
    if (repayAmount === 'max') {
      borrows.push({
        [borrowKey]: address,
        amount: MAX_UINT256
      } as Borrow);
    } else if (repayAmount !== '') {
      const maybeRepayAmount = maybeBigIntFromString(repayAmount, underlying.decimals);
      if (maybeRepayAmount !== undefined && maybeRepayAmount > borrowBalance) {
        return undefined;
      }

      if (maybeRepayAmount === undefined) {
        return undefined;
      } else {
        if (maybeRepayAmount > 0n) {
          borrows.push({
            [borrowKey]: address,
            amount: maybeRepayAmount
          } as Borrow);
        }
      }
    }
  }

  const swaps: Swap[] = [];
  for (let { borrowBalance, repayAmount, swapRoute, underlying } of borrowTokens) {
    const maybeRepayAmount =
      repayAmount === 'max' ? borrowBalance : maybeBigIntFromString(repayAmount, underlying.decimals);

    if (maybeRepayAmount !== undefined && maybeRepayAmount > 0n) {
      if (underlying.symbol === cometData.baseAsset.symbol) {
        swaps.push({
          path: '0x',
          amountInMaximum: MAX_UINT256
        });
      } else if (swapRoute !== undefined && swapRoute[0] === StateType.Hydrated) {
        swaps.push({
          path: swapRoute[1].path,
          amountInMaximum: MAX_UINT256
        });
      } else {
        return undefined;
      }
    }
  }

  if (v2BorrowValue > v2BorrowCapacity || v3BorrowValue > v3BorrowCapacityValue) {
    return 'Insufficient Collateral';
  }

  if (collateral.length === 0 && borrows.length === 0) {
    return;
  }

  const oneBaseAssetUnit = BigInt(10 ** cometData.baseAsset.decimals);
  const maximumBorrowValue = (v2ToV3MigrateBorrowValue * (BASE_FACTOR + SLIPPAGE_TOLERANCE)) / BASE_FACTOR; // pad borrow value by 1 + SLIPPAGE_TOLERANCE
  const flashAmount = (maximumBorrowValue * oneBaseAssetUnit) / cometData.baseAsset.price;
  if (flashAmount > cometData.baseAsset.balanceOfComet) {
    return `Insufficient ${cometData.baseAsset.symbol} Liquidity`;
  }

  return [{ collateral, borrows, swaps }, flashAmount];
}

type MigrateArgs = {
  migrator: Contract;
  migrationSource: MigrationSource;
  migrateParams: MigrateParamas;
  failureCallback: (error: string) => void;
  successCallback: () => void;
  trackTransaction: (
    key: string,
    responsePromise: Promise<TransactionResponse>,
    callback?: () => void
  ) => Promise<TransactionResponse>;
};

export async function migrate({
  migrator,
  migrationSource,
  migrateParams,
  failureCallback,
  successCallback,
  trackTransaction
}: MigrateArgs) {
  if (migrateParams !== undefined && typeof migrateParams !== 'string') {
    const args =
      migrationSource === MigrationSource.AaveV2
        ? [[[], [], []], migrateParams[0], migrateParams[1]]
        : [migrateParams[0], [[], [], []], migrateParams[1]];

    try {
      await trackTransaction(migratorTrxKey(migrator.address), migrator.migrate(...args), successCallback);
    } catch (e) {
      if ('code' in (e as any) && (e as any).code === 'UNPREDICTABLE_GAS_LIMIT') {
        failureCallback('Migration will fail if sent, e.g. due to collateral factors. Please adjust parameters.');
      }
    }
  }
}

type ApproveArgs = {
  migratorAddress: string;
  token: Contract;
  trackTransaction: (
    key: string,
    responsePromise: Promise<TransactionResponse>,
    callback?: () => void
  ) => Promise<TransactionResponse>;
};

export async function approve({ migratorAddress, token, trackTransaction }: ApproveArgs) {
  await trackTransaction(
    tokenApproveTrxKey(token.address, migratorAddress),
    token.approve(migratorAddress, MAX_UINT256)
  );
}
