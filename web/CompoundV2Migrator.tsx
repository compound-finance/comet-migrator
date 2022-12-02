import '../styles/main.scss';

import { CometState } from '@compound-finance/comet-extension';
import { Contract } from '@ethersproject/contracts';
import { JsonRpcProvider } from '@ethersproject/providers';
import { Protocol } from '@uniswap/router-sdk';
import { AlphaRouter, SwapType, V3Route } from '@uniswap/smart-order-router';
import { CurrencyAmount, Percent, Token, TradeType } from '@uniswap/sdk-core';
import { encodeRouteToPath } from '@uniswap/v3-sdk';
import { Contract as MulticallContract, Provider } from 'ethers-multicall';
import { ReactNode, useEffect, useMemo, useReducer, useState } from 'react';

import Comet from '../abis/Comet';
import Comptroller from '../abis/Comptroller';
import CToken from '../abis/CToken';
import CompoundV2Oracle from '../abis/Oracle';

import ApproveModal from './components/ApproveModal';
import { InputViewError, notEnoughLiquidityError, supplyCapError } from './components/ErrorViews';
import { ArrowRight, CircleExclamation } from './components/Icons';
import { LoadingView } from './components/LoadingViews';

import { multicall } from './helpers/multicall';
import {
  amountToWei,
  formatTokenBalance,
  getRiskLevelAndPercentage,
  maybeBigIntFromString,
  parseNumber,
  MAX_UINT256,
  PRICE_PRECISION,
  FACTOR_PRECISION,
  SLIPPAGE_TOLERANCE,
  BASE_FACTOR
} from './helpers/numbers';
import { getDocument, migratorTrxKey, tokenApproveTrxKey, migrationSourceToDisplayString } from './helpers/utils';

import { useAsyncEffect } from './lib/useAsyncEffect';
import { usePoll } from './lib/usePoll';
import {
  hasAwaitingConfirmationTransaction,
  hasPendingTransaction,
  useTransactionTracker
} from './lib/useTransactionTracker';

import { CTokenSym, Network, NetworkConfig, getIdByNetwork, stableCoins } from './Network';
import { AppProps, ApproveModalProps, MigrationSource, StateType, SwapInfo } from './types';
import SwapDropdown from './components/SwapDropdown';
import Dropdown from './components/Dropdown';

type CompoundV2MigratorProps<N extends Network> = AppProps & {
  account: string;
  networkConfig: NetworkConfig<N>;
  selectMigratorSource: (source: MigrationSource) => void;
};

interface Borrow {
  cToken: string;
  amount: bigint;
}

interface Collateral {
  cToken: string;
  amount: bigint;
}

interface Swap {
  path: string;
  amountInMaximum: bigint;
}

type SwapRouteState = undefined | [StateType.Loading] | [StateType.Hydrated, SwapInfo];

interface CTokenState {
  address: string;
  allowance: bigint;
  balance: bigint;
  balanceUnderlying: bigint;
  borrowBalance: bigint;
  collateralFactor: bigint;
  decimals: number;
  exchangeRate: bigint;
  price: bigint;
  repayAmount: string | 'max';
  transfer: string | 'max';
  underlying: {
    address: string;
    decimals: number;
    name: string;
    symbol: string;
  };
  swapRoute: SwapRouteState;
}

interface MigratorStateData<Network> {
  error: string | null;
  migratorEnabled: boolean;
  cTokens: Map<CTokenSym<Network>, CTokenState>;
}

type MigratorStateLoading = { type: StateType.Loading; data: { error: null | string } };
type MigratorStateHydrated = {
  type: StateType.Hydrated;
  data: MigratorStateData<Network>;
};
type MigratorState = MigratorStateLoading | MigratorStateHydrated;

enum ActionType {
  ClearRepayAndTransferAmounts = 'clear-amounts',
  SetAccountState = 'set-account-state',
  SetError = 'set-error',
  SetRepayAmount = 'set-repay-amount',
  SetSwapRoute = 'set-swap-route',
  SetTransferForCToken = 'set-transfer-for-ctoken'
}

type ActionSetAccountState = {
  type: ActionType.SetAccountState;
  payload: {
    migratorEnabled: boolean;
    cTokens: Map<CTokenSym<Network>, CTokenState>;
  };
};
type ActionSetError = {
  type: ActionType.SetError;
  payload: {
    error: string;
  };
};
type ActionSetRepayAmount = {
  type: ActionType.SetRepayAmount;
  payload: {
    symbol: CTokenSym<Network>;
    repayAmount: string;
  };
};
type ActionSetSwapRoute = {
  type: ActionType.SetSwapRoute;
  payload: {
    symbol: CTokenSym<Network>;
    swapRoute: SwapRouteState;
  };
};
type ActionSetTransferForCToken = {
  type: ActionType.SetTransferForCToken;
  payload: {
    symbol: CTokenSym<Network>;
    transfer: string;
  };
};
type ActionClearRepayAndTransferAmounts = {
  type: ActionType.ClearRepayAndTransferAmounts;
};

type Action =
  | ActionClearRepayAndTransferAmounts
  | ActionSetAccountState
  | ActionSetError
  | ActionSetRepayAmount
  | ActionSetSwapRoute
  | ActionSetTransferForCToken;

function reducer(state: MigratorState, action: Action): MigratorState {
  switch (action.type) {
    case ActionType.ClearRepayAndTransferAmounts: {
      if (state.type !== StateType.Hydrated) return state;

      const cTokenCopy: Map<CTokenSym<Network>, CTokenState> = new Map(
        Array.from(state.data.cTokens).map(([sym, tokenState]) => {
          return [
            sym,
            {
              ...tokenState,
              repayAmount: '',
              transfer: ''
            }
          ];
        })
      );

      return {
        type: StateType.Hydrated,
        data: {
          ...state.data,
          error: null,
          cTokens: cTokenCopy
        }
      };
    }
    case ActionType.SetAccountState: {
      return {
        type: StateType.Hydrated,
        data: {
          error: null,
          ...action.payload
        }
      };
    }
    case ActionType.SetError: {
      const nextState = { ...state };
      nextState.data.error = action.payload.error;
      return nextState;
    }
    case ActionType.SetRepayAmount: {
      if (state.type !== StateType.Hydrated) return state;

      const cTokenCopy: Map<CTokenSym<Network>, CTokenState> = new Map(Array.from(state.data.cTokens));
      cTokenCopy.set(action.payload.symbol, {
        ...(state.data.cTokens.get(action.payload.symbol) as CTokenState),
        repayAmount: action.payload.repayAmount
      });

      return {
        type: StateType.Hydrated,
        data: {
          ...state.data,
          error: null,
          cTokens: cTokenCopy
        }
      };
    }
    case ActionType.SetSwapRoute: {
      if (state.type !== StateType.Hydrated) return state;

      const cTokenCopy: Map<CTokenSym<Network>, CTokenState> = new Map(Array.from(state.data.cTokens));
      cTokenCopy.set(action.payload.symbol, {
        ...(state.data.cTokens.get(action.payload.symbol) as CTokenState),
        swapRoute: action.payload.swapRoute
      });

      return {
        type: StateType.Hydrated,
        data: {
          ...state.data,
          error: null,
          cTokens: cTokenCopy
        }
      };
    }
    case ActionType.SetTransferForCToken: {
      if (state.type !== StateType.Hydrated) return state;

      const cTokenCopy: Map<CTokenSym<Network>, CTokenState> = new Map(Array.from(state.data.cTokens));
      cTokenCopy.set(action.payload.symbol, {
        ...(state.data.cTokens.get(action.payload.symbol) as CTokenState),
        transfer: action.payload.transfer
      });

      return {
        type: StateType.Hydrated,
        data: {
          ...state.data,
          error: null,
          cTokens: cTokenCopy
        }
      };
    }
  }
}
const initialState: MigratorState = { type: StateType.Loading, data: { error: null } };

export default function CompoundV2Migrator<N extends Network>({
  rpc,
  web3,
  account,
  networkConfig,
  selectMigratorSource
}: CompoundV2MigratorProps<N>) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [cometState, setCometState] = useState<CometState>([StateType.Loading, undefined]);
  const [approveModal, setApproveModal] = useState<Omit<ApproveModalProps, 'transactionTracker'> | undefined>(
    undefined
  );
  const { tracker, trackTransaction } = useTransactionTracker(web3);

  useEffect(() => {
    if (rpc) {
      rpc.on({
        setTheme: ({ theme }) => {
          getDocument(document => {
            document.body.classList.add('theme');
            document.body.classList.remove(`theme--dark`);
            document.body.classList.remove(`theme--light`);
            document.body.classList.add(`theme--${theme.toLowerCase()}`);
          });
        },
        setCometState: ({ cometState: cometStateNew }) => {
          setCometState(cometStateNew);
        }
      });
    }
  }, [rpc]);

  const timer = usePoll(5000);

  const signer = useMemo(() => {
    return web3.getSigner().connectUnchecked();
  }, [web3, account]);

  const cTokenCtxs = useMemo(() => {
    return new Map(
      networkConfig.cTokens.map(({ abi, address, symbol }) => [symbol, new Contract(address, abi ?? [], signer)])
    ) as Map<CTokenSym<Network>, Contract>;
  }, [signer]);

  const migrator = useMemo(() => new Contract(networkConfig.migratorAddress, networkConfig.migratorAbi, signer), [
    signer,
    networkConfig.network
  ]);
  const comet = useMemo(() => new MulticallContract(networkConfig.rootsV3.comet, Comet), []);
  const comptroller = useMemo(() => new Contract(networkConfig.comptrollerAddress, Comptroller, signer), [
    signer,
    networkConfig.network
  ]);
  const comptrollerRead = useMemo(() => new MulticallContract(networkConfig.comptrollerAddress, Comptroller), []);
  const compoundOraclePromise = useMemo(async () => {
    const oracleAddress = await comptroller.oracle();
    return new MulticallContract(oracleAddress, CompoundV2Oracle);
  }, [comptroller]);

  const ethcallProvider = useMemo(() => new Provider(web3, getIdByNetwork(networkConfig.network)), [
    web3,
    networkConfig.network
  ]);

  async function setTokenApproval(tokenSym: CTokenSym<Network>) {
    const tokenContract = cTokenCtxs.get(tokenSym)!;
    await trackTransaction(
      tokenApproveTrxKey(tokenContract.address, migrator.address),
      tokenContract.approve(migrator.address, MAX_UINT256)
    );
  }

  useAsyncEffect(async () => {
    const cTokenContracts = networkConfig.cTokens.map(({ address }) => new MulticallContract(address, CToken));
    const oracle = await compoundOraclePromise;

    const balanceCalls = cTokenContracts.map(cTokenContract => cTokenContract.balanceOf(account));
    const borrowBalanceCalls = cTokenContracts.map(cTokenContract => cTokenContract.borrowBalanceCurrent(account));
    const exchangeRateCalls = cTokenContracts.map(cTokenContract => cTokenContract.exchangeRateCurrent());
    const allowanceCalls = cTokenContracts.map(cTokenContract => cTokenContract.allowance(account, migrator.address));
    const collateralFactorCalls = cTokenContracts.map(cTokenContract =>
      comptrollerRead.markets(cTokenContract.address)
    );
    const priceCalls = networkConfig.cTokens.map(cToken => {
      const priceSymbol = cToken.underlying.symbol === 'WBTC' ? 'BTC' : cToken.underlying.symbol;
      return oracle.price(priceSymbol);
    });

    const [
      migratorEnabled,
      balanceResponses,
      borrowBalanceResponses,
      exchangeRateResponses,
      allowanceResponses,
      collateralFactorResponses,
      priceResponses
    ] = await multicall(ethcallProvider, [
      comet.allowance(account, migrator.address),
      balanceCalls,
      borrowBalanceCalls,
      exchangeRateCalls,
      allowanceCalls,
      collateralFactorCalls,
      priceCalls
    ]);
    const balances = balanceResponses.map((balance: any) => balance.toBigInt());
    const borrowBalances = borrowBalanceResponses.map((borrowBalance: any) => borrowBalance.toBigInt());
    const exchangeRates = exchangeRateResponses.map((exchangeRate: any) => exchangeRate.toBigInt());
    const allowances = allowanceResponses.map((allowance: any) => allowance.toBigInt());
    const collateralFactors = collateralFactorResponses.map(([, collateralFactor]: any) => collateralFactor.toBigInt());
    const prices = priceResponses.map((price: any) => price.toBigInt() * 100n); // Scale up to match V3 price precision of 1e8

    const tokenStates = new Map(
      networkConfig.cTokens.map((cToken, index) => {
        const maybeTokenState = state.type === StateType.Loading ? undefined : state.data.cTokens.get(cToken.symbol);

        const balance: bigint = balances[index];
        const borrowBalance: bigint = borrowBalances[index];
        const exchangeRate: bigint = exchangeRates[index];
        const balanceUnderlying: bigint = (balance * exchangeRate) / 1000000000000000000n;
        const allowance: bigint = allowances[index];
        const collateralFactor: bigint = collateralFactors[index];
        const decimals: number = cToken.decimals;
        const repayAmount: string = maybeTokenState?.repayAmount ?? '';
        const transfer: string = maybeTokenState?.transfer ?? '';
        const swapRoute: SwapRouteState = maybeTokenState?.swapRoute;
        const price: bigint = prices[index];

        return [
          cToken.symbol,
          {
            address: cToken.address,
            allowance,
            balance,
            balanceUnderlying,
            borrowBalance,
            collateralFactor,
            decimals,
            exchangeRate,
            price,
            underlying: cToken.underlying,
            repayAmount,
            transfer,
            swapRoute
          }
        ];
      })
    );

    dispatch({
      type: ActionType.SetAccountState,
      payload: {
        migratorEnabled,
        cTokens: tokenStates
      }
    });
  }, [timer, tracker, account, networkConfig.network]);

  if (state.type === StateType.Loading || cometState[0] !== StateType.Hydrated) {
    return <LoadingView migrationSource={MigrationSource.CompoundV2} />;
  }
  const cometData = cometState[1];

  const cTokensWithBorrowBalances = Array.from(state.data.cTokens.entries()).filter(([, tokenState]) => {
    return tokenState.borrowBalance > 0n && !!stableCoins.find(coin => coin === tokenState.underlying.symbol);
  });
  const collateralWithBalances = Array.from(state.data.cTokens.entries()).filter(([, tokenState]) => {
    const v3CollateralAsset = cometData.collateralAssets.find(asset => asset.symbol === tokenState.underlying.symbol);
    return v3CollateralAsset !== undefined && tokenState.balance > 0n;
  });
  const cTokens = Array.from(state.data.cTokens.entries());
  const v2BorrowValue = cTokens.reduce((acc, [, { borrowBalance, underlying, price, repayAmount }]) => {
    const maybeRepayAmount =
      repayAmount === 'max' ? borrowBalance : maybeBigIntFromString(repayAmount, underlying.decimals);
    const repayAmountBigInt =
      maybeRepayAmount === undefined ? 0n : maybeRepayAmount > borrowBalance ? borrowBalance : maybeRepayAmount;
    return acc + ((borrowBalance - repayAmountBigInt) * price) / BigInt(10 ** underlying.decimals);
  }, BigInt(0));
  const displayV2BorrowValue = formatTokenBalance(PRICE_PRECISION, v2BorrowValue, false, true);

  const v2CollateralValue = cTokens.reduce((acc, [, { balanceUnderlying, underlying, price, transfer }]) => {
    const maybeTransfer = transfer === 'max' ? balanceUnderlying : maybeBigIntFromString(transfer, underlying.decimals);
    const transferBigInt =
      maybeTransfer === undefined ? 0n : maybeTransfer > balanceUnderlying ? balanceUnderlying : maybeTransfer;
    return acc + ((balanceUnderlying - transferBigInt) * price) / BigInt(10 ** underlying.decimals);
  }, BigInt(0));
  const displayV2CollateralValue = formatTokenBalance(PRICE_PRECISION, v2CollateralValue, false, true);

  const v2UnsupportedCollateralValue = cTokens.reduce((acc, [, { balanceUnderlying, underlying, price }]) => {
    const v3CollateralAsset = cometData.collateralAssets.find(asset => asset.symbol === underlying.symbol);
    const balance = v3CollateralAsset === undefined ? balanceUnderlying : 0n;
    return acc + (balance * price) / BigInt(10 ** underlying.decimals);
  }, BigInt(0));
  const displayV2UnsupportedCollateralValue = formatTokenBalance(
    PRICE_PRECISION,
    v2UnsupportedCollateralValue,
    false,
    true
  );

  const v2BorrowCapacity = cTokens.reduce(
    (acc, [, { balanceUnderlying, collateralFactor, price, transfer, underlying }]) => {
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

  const v2ToV3MigrateBorrowValue = cTokens.reduce((acc, [, { borrowBalance, underlying, price, repayAmount }]) => {
    const maybeRepayAmount =
      repayAmount === 'max' ? borrowBalance : maybeBigIntFromString(repayAmount, underlying.decimals);
    const repayAmountBigInt =
      maybeRepayAmount === undefined ? 0n : maybeRepayAmount > borrowBalance ? borrowBalance : maybeRepayAmount;
    return acc + (repayAmountBigInt * price) / BigInt(10 ** underlying.decimals);
  }, BigInt(0));
  const existinBorrowBalance = cometData.baseAsset.balance < 0n ? -cometData.baseAsset.balance : 0n;
  const existingBorrowValue: bigint =
    (existinBorrowBalance * cometData.baseAsset.price) / BigInt(10 ** cometData.baseAsset.decimals);
  const v3BorrowValue = existingBorrowValue + v2ToV3MigrateBorrowValue;

  const displayV3BorrowValue = formatTokenBalance(PRICE_PRECISION, v3BorrowValue, false, true);

  const v2ToV3MigrateCollateralValue = cTokens.reduce((acc, [, { balanceUnderlying, underlying, price, transfer }]) => {
    const maybeTransfer = transfer === 'max' ? balanceUnderlying : maybeBigIntFromString(transfer, underlying.decimals);
    const transferBigInt =
      maybeTransfer === undefined ? 0n : maybeTransfer > balanceUnderlying ? balanceUnderlying : maybeTransfer;
    return acc + (transferBigInt * price) / BigInt(10 ** underlying.decimals);
  }, BigInt(0));
  const v3CollateralValuePreMigrate = cometData.collateralAssets.reduce((acc, { balance, decimals, price }) => {
    return acc + (balance * price) / BigInt(10 ** decimals);
  }, BigInt(0));

  const v3CollateralValue = v2ToV3MigrateCollateralValue + v3CollateralValuePreMigrate;
  const displayV3CollateralValue = formatTokenBalance(PRICE_PRECISION, v3CollateralValue, false, true);

  const v3BorrowCapacityValue = cometData.collateralAssets.reduce(
    (acc, { balance, collateralFactor, decimals, price, symbol }) => {
      const maybeCToken = cTokens.find(([sym]) => sym.slice(1) === symbol)?.[1];
      const maybeTransfer =
        maybeCToken === undefined
          ? undefined
          : maybeCToken.transfer === 'max'
          ? maybeCToken.balanceUnderlying
          : maybeBigIntFromString(maybeCToken.transfer, maybeCToken.underlying.decimals);
      const transferBigInt =
        maybeTransfer === undefined
          ? 0n
          : maybeCToken !== undefined && maybeTransfer > maybeCToken.balanceUnderlying
          ? maybeCToken.balanceUnderlying
          : maybeTransfer;

      const dollarValue = ((balance + transferBigInt) * price) / BigInt(10 ** decimals);
      const capacity = (dollarValue * collateralFactor) / BigInt(10 ** FACTOR_PRECISION);

      return acc + capacity;
    },
    BigInt(0)
  );
  const displayV3BorrowCapacity = formatTokenBalance(PRICE_PRECISION, v3BorrowCapacityValue, false, true);

  const v3LiquidationCapacityValue = cometData.collateralAssets.reduce(
    (acc, { balance, liquidateCollateralFactor, decimals, price, symbol }) => {
      const maybeCToken = cTokens.find(([sym]) => sym.slice(1) === symbol)?.[1];
      const maybeTransfer =
        maybeCToken === undefined
          ? undefined
          : maybeCToken.transfer === 'max'
          ? maybeCToken.balanceUnderlying
          : maybeBigIntFromString(maybeCToken.transfer, maybeCToken.underlying.decimals);
      const transferBigInt =
        maybeTransfer === undefined
          ? 0n
          : maybeCToken !== undefined && maybeTransfer > maybeCToken.balanceUnderlying
          ? maybeCToken.balanceUnderlying
          : maybeTransfer;
      const dollarValue = ((balance + transferBigInt) * price) / BigInt(10 ** decimals);
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

  function validateForm():
    | [{ collateral: Collateral[]; borrows: Borrow[]; swaps: Swap[] }, bigint]
    | string
    | undefined {
    if (state.type === StateType.Loading || !state.data.migratorEnabled) {
      return undefined;
    }

    const collateral: Collateral[] = [];
    for (let [
      ,
      { address, balance, balanceUnderlying, underlying, transfer, exchangeRate }
    ] of state.data.cTokens.entries()) {
      const collateralAsset = cometData.collateralAssets.find(asset => asset.symbol === underlying.symbol);

      if (!collateralAsset) {
        continue;
      }

      if (transfer === 'max') {
        if (collateralAsset.totalSupply + balance > collateralAsset.supplyCap) {
          return undefined;
        }

        collateral.push({
          cToken: address,
          amount: balance
        });
      } else if (transfer !== '') {
        const maybeTransfer = maybeBigIntFromString(transfer, underlying.decimals);
        if (maybeTransfer !== undefined && maybeTransfer > balanceUnderlying) {
          return undefined;
        } else if (
          maybeTransfer !== undefined &&
          collateralAsset.totalSupply + maybeTransfer > collateralAsset.supplyCap
        ) {
          return undefined;
        }

        const transferAmount = parseNumber(transfer, n =>
          amountToWei((n * 1e18) / Number(exchangeRate), underlying.decimals!)
        );
        if (transferAmount === null) {
          return undefined;
        } else {
          if (transferAmount > 0n) {
            collateral.push({
              cToken: address,
              amount: transferAmount
            });
          }
        }
      }
    }

    const borrows: Borrow[] = [];
    for (let [, { address, borrowBalance, underlying, repayAmount }] of state.data.cTokens.entries()) {
      if (repayAmount === 'max') {
        borrows.push({
          cToken: address,
          amount: MAX_UINT256
        });
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
              cToken: address,
              amount: maybeRepayAmount
            });
          }
        }
      }
    }

    const swaps: Swap[] = [];
    for (let [symbol, { borrowBalance, repayAmount, swapRoute, underlying }] of state.data.cTokens.entries()) {
      const maybeRepayAmount =
        repayAmount === 'max' ? borrowBalance : maybeBigIntFromString(repayAmount, underlying.decimals);

      if (maybeRepayAmount !== undefined && maybeRepayAmount > 0n) {
        if (symbol === 'cUSDC') {
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

    if (!hasMigratePosition) {
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

  const migrateParams = state.data.error ?? validateForm();

  async function migrate() {
    if (migrateParams !== undefined && typeof migrateParams !== 'string') {
      try {
        console.log('Migrate Params', migrateParams);

        await trackTransaction(
          migratorTrxKey(migrator.address),
          migrator.migrate(migrateParams[0], [[], [], []], migrateParams[1]),
          () => {
            dispatch({ type: ActionType.ClearRepayAndTransferAmounts });
          }
        );
      } catch (e) {
        if ('code' in (e as any) && (e as any).code === 'UNPREDICTABLE_GAS_LIMIT') {
          dispatch({
            type: ActionType.SetError,
            payload: {
              error: 'Migration will fail if sent, e.g. due to collateral factors. Please adjust parameters.'
            }
          });
        }
      }
    }
  }

  const quoteProvider = import.meta.env.VITE_BYPASS_MAINNET_RPC_URL
    ? new JsonRpcProvider(import.meta.env.VITE_BYPASS_MAINNET_RPC_URL)
    : web3;
  const uniswapRouter = new AlphaRouter({ chainId: getIdByNetwork(networkConfig.network), provider: quoteProvider });
  const BASE_ASSET = new Token(
    getIdByNetwork(networkConfig.network),
    cometData.baseAsset.address,
    cometData.baseAsset.decimals,
    cometData.baseAsset.symbol,
    cometData.baseAsset.name
  );

  let borrowEl;
  if (cTokensWithBorrowBalances.length > 0) {
    borrowEl = cTokensWithBorrowBalances.map(([sym, tokenState]) => {
      let repayAmount: string;
      let repayAmountDollarValue: string;
      let errorTitle: string | undefined;
      let errorDescription: string | undefined;

      if (tokenState.repayAmount === 'max') {
        repayAmount = formatTokenBalance(tokenState.underlying.decimals, tokenState.borrowBalance);
        repayAmountDollarValue = formatTokenBalance(
          tokenState.underlying.decimals + PRICE_PRECISION,
          tokenState.borrowBalance * tokenState.price,
          false,
          true
        );

        if (
          (tokenState.underlying.symbol === cometData.baseAsset.symbol &&
            tokenState.borrowBalance > cometData.baseAsset.balanceOfComet) ||
          (tokenState.swapRoute !== undefined &&
            tokenState.swapRoute[0] === StateType.Hydrated &&
            tokenState.swapRoute[1].tokenIn.amount > cometData.baseAsset.balanceOfComet)
        ) {
          [errorTitle, errorDescription] = notEnoughLiquidityError(cometData.baseAsset);
        }
      } else {
        const maybeRepayAmount = maybeBigIntFromString(tokenState.repayAmount, tokenState.underlying.decimals);

        if (maybeRepayAmount === undefined) {
          repayAmount = tokenState.repayAmount;
          repayAmountDollarValue = '$0.00';
        } else {
          repayAmount = tokenState.repayAmount;
          repayAmountDollarValue = formatTokenBalance(
            tokenState.underlying.decimals + PRICE_PRECISION,
            maybeRepayAmount * tokenState.price,
            false,
            true
          );

          if (maybeRepayAmount > tokenState.borrowBalance) {
            errorTitle = 'Amount Exceeds Borrow Balance.';
            errorDescription = `Value must be less than or equal to ${formatTokenBalance(
              tokenState.underlying.decimals,
              tokenState.borrowBalance,
              false
            )}`;
          } else if (
            (tokenState.underlying.symbol === cometData.baseAsset.symbol &&
              maybeRepayAmount > cometData.baseAsset.balanceOfComet) ||
            (tokenState.swapRoute !== undefined &&
              tokenState.swapRoute[0] === StateType.Hydrated &&
              tokenState.swapRoute[1].tokenIn.amount > cometData.baseAsset.balanceOfComet)
          ) {
            [errorTitle, errorDescription] = notEnoughLiquidityError(cometData.baseAsset);
          }
        }
      }

      return (
        <div className="migrator__input-view" key={sym}>
          <div className="migrator__input-view__content">
            <div className="migrator__input-view__left">
              <div className="migrator__input-view__header">
                <div className={`asset asset--${tokenState.underlying.symbol}`}></div>
                <label className="L2 label text-color--1">{tokenState.underlying.symbol}</label>
                {tokenState.underlying.symbol !== cometData.baseAsset.symbol && (
                  <>
                    <ArrowRight className="svg--icon--2" />
                    <div className={`asset asset--${cometData.baseAsset.symbol}`}></div>
                    <label className="L2 label text-color--1">{cometData.baseAsset.symbol}</label>
                  </>
                )}
              </div>
              <div className="migrator__input-view__holder">
                <input
                  placeholder="0.0000"
                  value={repayAmount}
                  onChange={e => {
                    dispatch({
                      type: ActionType.SetRepayAmount,
                      payload: { symbol: sym, repayAmount: e.target.value }
                    });
                  }}
                  type="text"
                  inputMode="decimal"
                />
                {tokenState.repayAmount === '' && (
                  <div className="migrator__input-view__placeholder text-color--2">
                    <span className="text-color--1">0</span>.0000
                  </div>
                )}
              </div>
              <p className="meta text-color--2" style={{ marginTop: '0.25rem' }}>
                {repayAmountDollarValue}
              </p>
            </div>
            <div className="migrator__input-view__right">
              <button
                className="button button--small"
                disabled={tokenState.repayAmount === 'max'}
                onClick={() => {
                  dispatch({ type: ActionType.SetRepayAmount, payload: { symbol: sym, repayAmount: 'max' } });

                  if (tokenState.underlying.symbol !== cometData.baseAsset.symbol) {
                    dispatch({
                      type: ActionType.SetSwapRoute,
                      payload: { symbol: sym, swapRoute: [StateType.Loading] }
                    });

                    const token = new Token(
                      getIdByNetwork(networkConfig.network),
                      tokenState.underlying.address,
                      tokenState.underlying.decimals,
                      tokenState.underlying.symbol,
                      tokenState.underlying.name
                    );
                    const outputAmount = tokenState.borrowBalance.toString();
                    const amount = CurrencyAmount.fromRawAmount(token, outputAmount);
                    uniswapRouter
                      .route(
                        amount,
                        BASE_ASSET,
                        TradeType.EXACT_OUTPUT,
                        {
                          slippageTolerance: new Percent(SLIPPAGE_TOLERANCE.toString(), FACTOR_PRECISION.toString()),
                          type: SwapType.SWAP_ROUTER_02,
                          recipient: migrator.address,
                          deadline: Math.floor(Date.now() / 1000 + 1800)
                        },
                        {
                          protocols: [Protocol.V3],
                          maxSplits: 1 // This only makes one path
                        }
                      )
                      .then(route => {
                        if (route !== null) {
                          const swapInfo: SwapInfo = {
                            tokenIn: {
                              symbol: cometData.baseAsset.symbol,
                              decimals: cometData.baseAsset.decimals,
                              price: cometData.baseAsset.price,
                              amount: BigInt(
                                Number(route.quote.toFixed(cometData.baseAsset.decimals)) *
                                  10 ** cometData.baseAsset.decimals
                              )
                            },
                            tokenOut: {
                              symbol: tokenState.underlying.symbol,
                              decimals: tokenState.underlying.decimals,
                              price: tokenState.price,
                              amount: tokenState.borrowBalance
                            },
                            networkFee: `$${route.estimatedGasUsedUSD.toFixed(2)}`,
                            path: encodeRouteToPath(route.route[0].route as V3Route, true)
                          };

                          dispatch({
                            type: ActionType.SetSwapRoute,
                            payload: { symbol: sym, swapRoute: [StateType.Hydrated, swapInfo] }
                          });
                        }
                      })
                      .catch(e => {
                        dispatch({
                          type: ActionType.SetSwapRoute,
                          payload: { symbol: sym, swapRoute: undefined }
                        });
                      });
                  }
                }}
              >
                Max
              </button>
              <p className="meta text-color--2" style={{ marginTop: '0.75rem' }}>
                <span style={{ fontWeight: '500' }}>V2 balance:</span>{' '}
                {formatTokenBalance(tokenState.underlying.decimals, tokenState.borrowBalance, false)}
              </p>
              <p className="meta text-color--2">
                {formatTokenBalance(
                  tokenState.underlying.decimals + PRICE_PRECISION,
                  tokenState.borrowBalance * tokenState.price,
                  false,
                  true
                )}
              </p>
            </div>
          </div>
          <SwapDropdown baseAsset={cometData.baseAsset} state={tokenState.swapRoute} />
          {!!errorTitle && <InputViewError title={errorTitle} description={errorDescription} />}
        </div>
      );
    });
  }

  let collateralEl = null;
  if (collateralWithBalances.length > 0) {
    collateralEl = collateralWithBalances.map(([sym, tokenState]) => {
      let transfer: string;
      let transferDollarValue: string;
      let errorTitle: string | undefined;
      let errorDescription: string | undefined;
      const disabled = tokenState.allowance === 0n;
      const collateralAsset = cometData.collateralAssets.find(asset => asset.symbol === tokenState.underlying.symbol);

      if (tokenState.transfer === 'max') {
        transfer = formatTokenBalance(tokenState.underlying.decimals, tokenState.balanceUnderlying);
        transferDollarValue = formatTokenBalance(
          tokenState.underlying.decimals + PRICE_PRECISION,
          tokenState.balanceUnderlying * tokenState.price,
          false,
          true
        );

        if (
          collateralAsset !== undefined &&
          tokenState.balanceUnderlying + collateralAsset.totalSupply > collateralAsset.supplyCap
        ) {
          [errorTitle, errorDescription] = supplyCapError(collateralAsset);
        }
      } else {
        const maybeTransfer = maybeBigIntFromString(tokenState.transfer, tokenState.underlying.decimals);

        if (maybeTransfer === undefined) {
          transfer = tokenState.transfer;
          transferDollarValue = '$0.00';
        } else {
          transfer = tokenState.transfer;
          transferDollarValue = formatTokenBalance(
            tokenState.underlying.decimals + PRICE_PRECISION,
            maybeTransfer * tokenState.price,
            false,
            true
          );

          if (maybeTransfer > tokenState.balanceUnderlying) {
            errorTitle = 'Amount Exceeds Balance.';
            errorDescription = `Value must be less than or equal to ${formatTokenBalance(
              tokenState.underlying.decimals,
              tokenState.balanceUnderlying,
              false
            )}`;
          } else if (
            collateralAsset !== undefined &&
            maybeTransfer + collateralAsset.totalSupply > collateralAsset.supplyCap
          ) {
            [errorTitle, errorDescription] = supplyCapError(collateralAsset);
          }
        }
      }

      const key = tokenApproveTrxKey(tokenState.address, migrator.address);

      return (
        <div className="migrator__input-view" key={key}>
          <div className="migrator__input-view__content">
            <div className="migrator__input-view__left">
              <div className="migrator__input-view__header">
                <div className={`asset asset--${tokenState.underlying.symbol}`}></div>
                <label className="L2 label text-color--1">{tokenState.underlying.symbol}</label>
              </div>
              <div className="migrator__input-view__holder">
                <input
                  placeholder="0.0000"
                  value={transfer}
                  onChange={e =>
                    dispatch({
                      type: ActionType.SetTransferForCToken,
                      payload: { symbol: sym, transfer: e.target.value }
                    })
                  }
                  type="text"
                  inputMode="decimal"
                  disabled={disabled}
                />
                {tokenState.transfer === '' && !disabled && (
                  <div className="migrator__input-view__placeholder text-color--2">
                    <span className="text-color--1">0</span>.0000
                  </div>
                )}
              </div>
              <p className="meta text-color--2" style={{ marginTop: '0.25rem' }}>
                {transferDollarValue}
              </p>
            </div>
            <div className="migrator__input-view__right">
              {disabled ? (
                <button
                  className="button button--small"
                  disabled={hasPendingTransaction(tracker, key)}
                  onClick={() => {
                    setApproveModal({
                      asset: {
                        name: tokenState.underlying.name,
                        symbol: tokenState.underlying.symbol
                      },
                      transactionKey: key,
                      onActionClicked: (_asset, _descption) => setTokenApproval(sym),
                      onRequestClose: () => setApproveModal(undefined)
                    });
                  }}
                >
                  Enable
                </button>
              ) : (
                <button
                  className="button button--small"
                  disabled={tokenState.transfer === 'max'}
                  onClick={() =>
                    dispatch({ type: ActionType.SetTransferForCToken, payload: { symbol: sym, transfer: 'max' } })
                  }
                >
                  Max
                </button>
              )}
              <p className="meta text-color--2" style={{ marginTop: '0.75rem' }}>
                <span style={{ fontWeight: '500' }}>V2 balance:</span>{' '}
                {formatTokenBalance(tokenState.underlying.decimals, tokenState.balanceUnderlying, false)}
              </p>
              <p className="meta text-color--2">
                {formatTokenBalance(
                  tokenState.underlying.decimals + PRICE_PRECISION,
                  tokenState.balanceUnderlying * tokenState.price,
                  false,
                  true
                )}
              </p>
            </div>
          </div>
          {!!errorTitle && <InputViewError title={errorTitle} description={errorDescription} />}
        </div>
      );
    });
  }

  let migrateButtonText: ReactNode;

  if (hasAwaitingConfirmationTransaction(tracker, migratorTrxKey(migrator.address))) {
    migrateButtonText = 'Waiting For Confirmation';
  } else if (hasPendingTransaction(tracker)) {
    migrateButtonText = 'Transaction Pending...';
  } else if (typeof migrateParams === 'string') {
    migrateButtonText = migrateParams;
  } else {
    migrateButtonText = 'Migrate Balances';
  }

  return (
    <div className="page migrator">
      {!!approveModal && <ApproveModal {...approveModal} transactionTracker={tracker} />}
      <div className="container">
        <div className="migrator__content">
          <div className="migrator__balances">
            <div className="panel L4">
              <div className="panel__header-row">
                <h1 className="heading heading--emphasized">Balances</h1>
              </div>
              <p className="body">
                Select a source and the balances you want to migrate to Compound V3. If you are supplying USDC on one
                market while borrowing on the other, your ending balance will be the net of these two balances.
              </p>
              <div className="migrator__balances__section">
                <label className="L1 label text-color--2 migrator__balances__section__header">Source</label>
                <Dropdown
                  options={Object.values(MigrationSource).map(source => [
                    source,
                    migrationSourceToDisplayString(source)
                  ])}
                  selectedOption={migrationSourceToDisplayString(MigrationSource.CompoundV2)}
                  selectOption={(option: [string, string]) => {
                    selectMigratorSource(option[0] as MigrationSource);
                  }}
                />
              </div>

              {borrowEl === undefined ? (
                <div className="migrator__balances__alert">
                  <CircleExclamation className="svg--icon--2" />
                  <p className="meta text-color--2">No balances to show.</p>
                </div>
              ) : (
                <>
                  <div className="migrator__balances__section">
                    <label className="L1 label text-color--2 migrator__balances__section__header">Borrowing</label>
                    {borrowEl}
                  </div>
                  <div className="migrator__balances__section">
                    <label className="L1 label text-color--2 migrator__balances__section__header">Supplying</label>
                    {collateralEl}
                    {v2UnsupportedCollateralValue > 0n && (
                      <div
                        className="migrator__balances__alert"
                        style={{ marginTop: collateralWithBalances.length > 0 ? '1rem' : '0rem' }}
                      >
                        <CircleExclamation className="svg--icon--2" />
                        <p className="meta text-color--2">
                          {displayV2UnsupportedCollateralValue} of V2 collateral value cannot be migrated due to
                          unsupported collateral in V3.
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="migrator__summary">
            <div className="panel L4">
              <div className="panel__header-row">
                <h1 className="heading heading--emphasized">Summary</h1>
              </div>
              <p className="body">
                If you are borrowing other assets on Compound V2, migrating too much collateral could increase your
                liquidation risk.
              </p>
              <div className="migrator__summary__section">
                <label className="L1 label text-color--2 migrator__summary__section__header">{`V2 Position${
                  hasMigratePosition ? ' • After' : ''
                }`}</label>
                <div className="migrator__summary__section__row">
                  <div>
                    <p className="meta text-color--2">Borrowing</p>
                    <h4 className="heading heading--emphasized">{displayV2BorrowValue}</h4>
                  </div>
                </div>
                <div className="migrator__summary__section__row">
                  <div>
                    <p className="meta text-color--2">Collateral Value</p>
                    <p className="body body--link">{displayV2CollateralValue}</p>
                  </div>
                  <div>
                    <p className="meta text-color--2">Borrow Capacity</p>
                    <p className="body body--link">{displayV2BorrowCapacity}</p>
                  </div>
                </div>
                <div className="migrator__summary__section__row">
                  <div>
                    <p className="meta text-color--2">Available to Borrow</p>
                    <p className="body body--link">{displayV2AvailableToBorrow}</p>
                  </div>
                </div>
                <div className="migrator__summary__section__row">
                  <div>
                    <p className="meta text-color--2">Liquidation Risk</p>
                    <p className="body body--link">{`${v2RiskPercentage.toFixed(0)}%`}</p>
                  </div>
                </div>
                <div className="meter">
                  <div className="meter__bar">
                    <div
                      className={`meter__fill meter__fill--${v2RiskLevel}`}
                      style={{ width: v2RiskPercentageFill }}
                    ></div>
                  </div>
                </div>
              </div>
              <div
                className={`migrator__summary__section${
                  hasMigratePosition ? '' : ' migrator__summary__section--disabled'
                }`}
              >
                <label className="L1 label text-color--2 migrator__summary__section__header">{`V3 Position${
                  hasMigratePosition ? ' • After' : ''
                }`}</label>
                <div className="migrator__summary__section__row">
                  <div>
                    <p className="meta text-color--2">Borrowing</p>
                    <h4 className="heading heading--emphasized">{displayV3BorrowValue}</h4>
                  </div>
                </div>
                <div className="migrator__summary__section__row">
                  <div>
                    <p className="meta text-color--2">Collateral Value</p>
                    <p className="body body--link">{displayV3CollateralValue}</p>
                  </div>
                  <div>
                    <p className="meta text-color--2">Borrow Capacity</p>
                    <p className="body body--link">{displayV3BorrowCapacity}</p>
                  </div>
                </div>
                <div className="migrator__summary__section__row">
                  <div>
                    <p className="meta text-color--2">Available to Borrow</p>
                    <p className="body body--link">{displayV3AvailableToBorrow}</p>
                  </div>
                  <div>
                    <p className="meta text-color--2">Liquidation Point</p>
                    <p className="body body--link">{displayV3LiquidationPoint}</p>
                  </div>
                </div>
                <div className="migrator__summary__section__row">
                  <div>
                    <p className="meta text-color--2">Liquidation Risk</p>
                    <p className="body body--link">{`${v3RiskPercentage.toFixed(0)}%`}</p>
                  </div>
                </div>
                <div className="meter">
                  <div className="meter__bar">
                    <div
                      className={`meter__fill meter__fill--${v3RiskLevel}`}
                      style={{ width: v3RiskPercentageFill }}
                    ></div>
                  </div>
                </div>
              </div>
              <button
                className="button button--x-large"
                disabled={
                  migrateParams === undefined ||
                  typeof migrateParams === 'string' ||
                  hasPendingTransaction(tracker) ||
                  hasAwaitingConfirmationTransaction(tracker, migratorTrxKey(migrator.address))
                }
                onClick={migrate}
              >
                {migrateButtonText}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
