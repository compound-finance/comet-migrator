import '../styles/main.scss';

import { CometState } from '@compound-finance/comet-extension';
import { BaseAssetWithAccountState } from '@compound-finance/comet-extension/dist/CometState';
import { Contract } from '@ethersproject/contracts';
import { JsonRpcProvider } from '@ethersproject/providers';
import { Protocol } from '@uniswap/router-sdk';
import { AlphaRouter, SwapType, V3Route } from '@uniswap/smart-order-router';
import { CurrencyAmount, Percent, Token, TradeType } from '@uniswap/sdk-core';
import { encodeRouteToPath } from '@uniswap/v3-sdk';
import { Contract as MulticallContract, Provider } from 'ethers-multicall';
import { ReactNode, useMemo, useReducer, useState } from 'react';

import ATokenAbi from '../abis/Aave/AToken';
import AaveDebtToken from '../abis/Aave/DebtToken';
import AaveLendingPool from '../abis/Aave/LendingPool';
import AaveLendingPoolAddressesProvider from '../abis/Aave/LendingPoolAddressesProvider';
import AavePriceOracle from '../abis/Aave/PriceOracle';

import Comet from '../abis/Comet';

import AaveBorrowInputView from './components/AaveBorrowInputView';
import ApproveModal from './components/ApproveModal';
import Dropdown from './components/Dropdown';
import { InputViewError, supplyCapError } from './components/ErrorViews';
import { CircleExclamation } from './components/Icons';
import { LoadingView } from './components/LoadingViews';

import { multicall } from './helpers/multicall';
import {
  BASE_FACTOR,
  formatTokenBalance,
  getRiskLevelAndPercentage,
  maybeBigIntFromString,
  usdPriceFromEthPrice,
  SLIPPAGE_TOLERANCE,
  getLTVAsFactor
} from './helpers/numbers';
import { migratorTrxKey, tokenApproveTrxKey, migrationSourceToDisplayString } from './helpers/utils';

import { useAsyncEffect } from './lib/useAsyncEffect';
import { usePoll } from './lib/usePoll';
import {
  hasAwaitingConfirmationTransaction,
  hasPendingTransaction,
  useTransactionTracker
} from './lib/useTransactionTracker';

import { ATokenSym, Network, getIdByNetwork, AaveNetworkConfig, stableCoins } from './Network';
import {
  AppProps,
  ApproveModalProps,
  ATokenState,
  MigrationSource,
  StateType,
  SwapRouteState,
  SwapInfo
} from './types';

const MAX_UINT256 = BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935');
const FACTOR_PRECISION = 18;
const PRICE_PRECISION = 8;

type AaveV2MigratorProps<N extends Network> = AppProps & {
  account: string;
  cometState: CometState;
  networkConfig: AaveNetworkConfig<N>;
  selectMigratorSource: (source: MigrationSource) => void;
};

interface Borrow {
  aDebtToken: string;
  amount: bigint;
}

interface Collateral {
  aToken: string;
  amount: bigint;
}

interface Swap {
  path: string;
  amountInMaximum: bigint;
}

interface MigratorStateData<Network> {
  error: string | null;
  migratorEnabled: boolean;
  aTokens: Map<ATokenSym<Network>, ATokenState>;
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
  SetTransferForAToken = 'set-transfer-for-atoken'
}

type ActionSetAccountState = {
  type: ActionType.SetAccountState;
  payload: {
    migratorEnabled: boolean;
    aTokens: Map<ATokenSym<Network>, ATokenState>;
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
    symbol: ATokenSym<Network>;
    type: 'stable' | 'variable';
    repayAmount: string;
  };
};
type ActionSetSwapRoute = {
  type: ActionType.SetSwapRoute;
  payload: {
    symbol: ATokenSym<Network>;
    type: 'stable' | 'variable';
    swapRoute: SwapRouteState;
  };
};
type ActionSetTransferForAToken = {
  type: ActionType.SetTransferForAToken;
  payload: {
    symbol: ATokenSym<Network>;
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
  | ActionSetTransferForAToken;

function reducer(state: MigratorState, action: Action): MigratorState {
  switch (action.type) {
    case ActionType.ClearRepayAndTransferAmounts: {
      if (state.type !== StateType.Hydrated) return state;

      const aTokenCopy: Map<ATokenSym<Network>, ATokenState> = new Map(
        Array.from(state.data.aTokens).map(([sym, tokenState]) => {
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
          aTokens: aTokenCopy
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

      const aTokenCopy: Map<ATokenSym<Network>, ATokenState> = new Map(Array.from(state.data.aTokens));
      const repayAmountKey = action.payload.type === 'stable' ? 'repayAmountStable' : 'repayAmountVariable';
      aTokenCopy.set(action.payload.symbol, {
        ...(state.data.aTokens.get(action.payload.symbol) as ATokenState),
        [repayAmountKey]: action.payload.repayAmount
      });

      return {
        type: StateType.Hydrated,
        data: {
          ...state.data,
          error: null,
          aTokens: aTokenCopy
        }
      };
    }
    case ActionType.SetSwapRoute: {
      if (state.type !== StateType.Hydrated) return state;

      const aTokenCopy: Map<ATokenSym<Network>, ATokenState> = new Map(Array.from(state.data.aTokens));
      const swapRouteKey = action.payload.type === 'stable' ? 'swapRouteStable' : 'swapRouteVariable';
      aTokenCopy.set(action.payload.symbol, {
        ...(state.data.aTokens.get(action.payload.symbol) as ATokenState),
        [swapRouteKey]: action.payload.swapRoute
      });

      return {
        type: StateType.Hydrated,
        data: {
          ...state.data,
          error: null,
          aTokens: aTokenCopy
        }
      };
    }
    case ActionType.SetTransferForAToken: {
      if (state.type !== StateType.Hydrated) return state;

      const aTokenCopy: Map<ATokenSym<Network>, ATokenState> = new Map(Array.from(state.data.aTokens));
      aTokenCopy.set(action.payload.symbol, {
        ...(state.data.aTokens.get(action.payload.symbol) as ATokenState),
        transfer: action.payload.transfer
      });

      return {
        type: StateType.Hydrated,
        data: {
          ...state.data,
          error: null,
          aTokens: aTokenCopy
        }
      };
    }
  }
}
const initialState: MigratorState = { type: StateType.Loading, data: { error: null } };

export default function AaveV2Migrator<N extends Network>({
  web3,
  cometState,
  account,
  networkConfig,
  selectMigratorSource
}: AaveV2MigratorProps<N>) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [approveModal, setApproveModal] = useState<Omit<ApproveModalProps, 'transactionTracker'> | undefined>(
    undefined
  );
  const { tracker, trackTransaction } = useTransactionTracker(web3);

  const timer = usePoll(5000);
  const routerCache = useMemo(() => new Map<string, NodeJS.Timeout>(), [networkConfig.network]);

  const signer = useMemo(() => {
    return web3.getSigner().connectUnchecked();
  }, [web3, account]);

  const aTokenCtxs = useMemo(() => {
    return new Map(
      networkConfig.aTokens.map(({ aTokenAddress, aTokenSymbol }) => [
        aTokenSymbol,
        new Contract(aTokenAddress, ATokenAbi, signer)
      ])
    ) as Map<ATokenSym<Network>, Contract>;
  }, [signer]);

  const migrator = useMemo(() => new Contract(networkConfig.migratorAddress, networkConfig.migratorAbi, signer), [
    signer
  ]);
  const comet = useMemo(() => new MulticallContract(networkConfig.rootsV3.comet, Comet), []);
  const lendingPoolAddressesProvider = useMemo(
    () => new Contract(networkConfig.lendingPoolAddressesProviderAddress, AaveLendingPoolAddressesProvider, signer),
    [signer]
  );
  const lendingPool = useMemo(() => new MulticallContract(networkConfig.lendingPoolAddress, AaveLendingPool), []);
  const oraclePromise = useMemo(async () => {
    const oracleAddress = await lendingPoolAddressesProvider.getPriceOracle();
    return new MulticallContract(oracleAddress, AavePriceOracle);
  }, [lendingPoolAddressesProvider, networkConfig.network]);

  const ethcallProvider = useMemo(() => new Provider(web3, getIdByNetwork(networkConfig.network)), [
    web3,
    networkConfig.network
  ]);

  async function setTokenApproval(tokenSym: ATokenSym<Network>) {
    const tokenContract = aTokenCtxs.get(tokenSym)!;
    await trackTransaction(
      tokenApproveTrxKey(tokenContract.address, migrator.address),
      tokenContract.approve(migrator.address, MAX_UINT256)
    );
  }

  useAsyncEffect(async () => {
    const aTokenContracts = networkConfig.aTokens.map(
      ({ aTokenAddress }) => new MulticallContract(aTokenAddress, ATokenAbi)
    );
    const stableDebtTokenContracts = networkConfig.aTokens.map(
      ({ stableDebtTokenAddress }) => new MulticallContract(stableDebtTokenAddress, AaveDebtToken)
    );
    const variableDebtTokenContracts = networkConfig.aTokens.map(
      ({ variableDebtTokenAddress }) => new MulticallContract(variableDebtTokenAddress, AaveDebtToken)
    );
    const oracle = await oraclePromise;

    const balanceCalls = aTokenContracts.map(aTokenContract => aTokenContract.balanceOf(account));
    const allowanceCalls = aTokenContracts.map(aTokenContract => aTokenContract.allowance(account, migrator.address));
    const collateralFactorCalls = networkConfig.aTokens.map(({ address }) => lendingPool.getConfiguration(address));
    const borrowBalanceStableCalls = stableDebtTokenContracts.map(debtTokenContract =>
      debtTokenContract.balanceOf(account)
    );
    const borrowBalanceVariableCalls = variableDebtTokenContracts.map(debtTokenContract =>
      debtTokenContract.balanceOf(account)
    );

    const [
      migratorEnabled,
      usdcPriceInEth,
      pricesInEth,
      balanceResponses,
      allowanceResponses,
      collateralFactorResponses,
      borrowBalanceStableResponses,
      borrowBalanceVariableResponses
    ] = await multicall(ethcallProvider, [
      comet.allowance(account, migrator.address),
      oracle.getAssetPrice('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),
      oracle.getAssetsPrices(networkConfig.aTokens.map(aToken => aToken.address)),
      balanceCalls,
      allowanceCalls,
      collateralFactorCalls,
      borrowBalanceStableCalls,
      borrowBalanceVariableCalls
    ]);

    const balances = balanceResponses.map((balance: any) => balance.toBigInt());
    const allowances = allowanceResponses.map((allowance: any) => allowance.toBigInt());
    const collateralFactors = collateralFactorResponses.map((configData: any, i: number) =>
      getLTVAsFactor(configData.data.toBigInt())
    );
    const borrowBalancesStableDebtToken = borrowBalanceStableResponses.map((balance: any) => balance.toBigInt());
    const borrowBalancesVariableDebtToken = borrowBalanceVariableResponses.map((balance: any) => balance.toBigInt());
    const prices = pricesInEth.map((price: any) =>
      usdPriceFromEthPrice(usdcPriceInEth.toBigInt(), price.toBigInt(), 8)
    );

    const tokenStates = new Map(
      networkConfig.aTokens.map((aToken, index) => {
        const maybeTokenState =
          state.type === StateType.Loading ? undefined : state.data.aTokens.get(aToken.aTokenSymbol);

        const balance: bigint = balances[index];
        const allowance: bigint = allowances[index];
        const collateralFactor: bigint = collateralFactors[index];
        const borrowBalanceStable: bigint = borrowBalancesStableDebtToken[index];
        const borrowBalanceVariable: bigint = borrowBalancesVariableDebtToken[index];
        const repayAmountStable: string = maybeTokenState?.repayAmountStable ?? '';
        const repayAmountVariable: string = maybeTokenState?.repayAmountVariable ?? '';
        const transfer: string = maybeTokenState?.transfer ?? '';
        const swapRouteStable: SwapRouteState = maybeTokenState?.swapRouteStable;
        const swapRouteVariable: SwapRouteState = maybeTokenState?.swapRouteVariable;
        const price: bigint = prices[index];

        return [
          aToken.aTokenSymbol,
          {
            aToken: aToken,
            allowance,
            balance,
            borrowBalanceStable,
            borrowBalanceVariable,
            collateralFactor,
            price,
            repayAmountStable,
            repayAmountVariable,
            transfer,
            swapRouteStable,
            swapRouteVariable
          }
        ];
      })
    );

    dispatch({
      type: ActionType.SetAccountState,
      payload: {
        migratorEnabled,
        aTokens: tokenStates
      }
    });
  }, [timer, tracker, account, networkConfig.network]);

  if (state.type === StateType.Loading || cometState[0] !== StateType.Hydrated) {
    return <LoadingView migrationSource={MigrationSource.AaveV2} selectMigratorSource={selectMigratorSource} />;
  }
  const cometData = cometState[1];

  const aTokensWithBorrowBalances = Array.from(state.data.aTokens.entries()).filter(([, tokenState]) => {
    return (
      (tokenState.borrowBalanceStable > 0n || tokenState.borrowBalanceVariable > 0n) &&
      !!stableCoins.find(coin => coin === tokenState.aToken.symbol)
    );
  });
  const collateralWithBalances = Array.from(state.data.aTokens.entries()).filter(([, tokenState]) => {
    const v3CollateralAsset = cometData.collateralAssets.find(asset => asset.address === tokenState.aToken.address);
    return (
      (v3CollateralAsset !== undefined || tokenState.aToken.address === cometData.baseAsset.address) &&
      tokenState.balance > 0n
    );
  });
  const aTokens = Array.from(state.data.aTokens.entries());
  const v2BorrowValue = aTokens.reduce(
    (
      acc,
      [, { borrowBalanceStable, borrowBalanceVariable, aToken, price, repayAmountStable, repayAmountVariable }]
    ) => {
      const maybeRepayAmountStable =
        repayAmountStable === 'max' ? borrowBalanceStable : maybeBigIntFromString(repayAmountStable, aToken.decimals);
      const maybeRepayAmountVariable =
        repayAmountVariable === 'max'
          ? borrowBalanceVariable
          : maybeBigIntFromString(repayAmountVariable, aToken.decimals);
      const repayAmountStableBigInt =
        maybeRepayAmountStable === undefined
          ? 0n
          : maybeRepayAmountStable > borrowBalanceStable
          ? borrowBalanceStable
          : maybeRepayAmountStable;
      const repayAmountVariableBigInt =
        maybeRepayAmountVariable === undefined
          ? 0n
          : maybeRepayAmountVariable > borrowBalanceVariable
          ? borrowBalanceVariable
          : maybeRepayAmountVariable;
      return (
        acc +
        ((borrowBalanceStable + borrowBalanceVariable - repayAmountStableBigInt - repayAmountVariableBigInt) * price) /
          BigInt(10 ** aToken.decimals)
      );
    },
    BigInt(0)
  );
  const displayV2BorrowValue = formatTokenBalance(PRICE_PRECISION, v2BorrowValue, false, true);

  const v2CollateralValue = aTokens.reduce((acc, [, { aToken, balance, price, transfer }]) => {
    const maybeTransfer = transfer === 'max' ? balance : maybeBigIntFromString(transfer, aToken.decimals);
    const transferBigInt = maybeTransfer === undefined ? 0n : maybeTransfer > balance ? balance : maybeTransfer;
    return acc + ((balance - transferBigInt) * price) / BigInt(10 ** aToken.decimals);
  }, BigInt(0));
  const displayV2CollateralValue = formatTokenBalance(PRICE_PRECISION, v2CollateralValue, false, true);

  const v2UnsupportedCollateralValue = aTokens.reduce((acc, [, { aToken, balance, price }]) => {
    const v3CollateralAsset = cometData.collateralAssets.find(asset => asset.address === aToken.address);
    const collateralBalance =
      v3CollateralAsset === undefined && aToken.address !== cometData.baseAsset.address ? balance : 0n;
    return acc + (collateralBalance * price) / BigInt(10 ** aToken.decimals);
  }, BigInt(0));
  const displayV2UnsupportedCollateralValue = formatTokenBalance(
    PRICE_PRECISION,
    v2UnsupportedCollateralValue,
    false,
    true
  );

  const v2BorrowCapacity = aTokens.reduce((acc, [, { aToken, balance, collateralFactor, price, transfer }]) => {
    const maybeTransfer = transfer === 'max' ? balance : maybeBigIntFromString(transfer, aToken.decimals);
    const transferBigInt = maybeTransfer === undefined ? 0n : maybeTransfer > balance ? balance : maybeTransfer;
    const dollarValue = ((balance - transferBigInt) * price) / BigInt(10 ** aToken.decimals);
    const capacity = (dollarValue * collateralFactor) / BASE_FACTOR;
    return acc + capacity;
  }, BigInt(0));
  const displayV2BorrowCapacity = formatTokenBalance(PRICE_PRECISION, v2BorrowCapacity, false, true);

  const v2AvailableToBorrow = v2BorrowCapacity - v2BorrowValue;
  const displayV2AvailableToBorrow = formatTokenBalance(PRICE_PRECISION, v2AvailableToBorrow, false, true);

  const v2ToV3MigrateBorrowValue = aTokens.reduce(
    (
      acc,
      [, { aToken, borrowBalanceStable, borrowBalanceVariable, price, repayAmountStable, repayAmountVariable }]
    ) => {
      const maybeRepayAmountStable =
        repayAmountStable === 'max' ? borrowBalanceStable : maybeBigIntFromString(repayAmountStable, aToken.decimals);
      const maybeRepayAmountVariable =
        repayAmountVariable === 'max'
          ? borrowBalanceVariable
          : maybeBigIntFromString(repayAmountVariable, aToken.decimals);
      const repayAmountStableBigInt =
        maybeRepayAmountStable === undefined
          ? 0n
          : maybeRepayAmountStable > borrowBalanceStable
          ? borrowBalanceStable
          : maybeRepayAmountStable;
      const repayAmountVariableBigInt =
        maybeRepayAmountVariable === undefined
          ? 0n
          : maybeRepayAmountVariable > borrowBalanceVariable
          ? borrowBalanceVariable
          : maybeRepayAmountVariable;
      const newBorrowAmount = repayAmountStableBigInt + repayAmountVariableBigInt;

      return acc + (newBorrowAmount * price) / BigInt(10 ** aToken.decimals);
    },
    BigInt(0)
  );
  const existinBorrowBalance = cometData.baseAsset.balance < 0n ? -cometData.baseAsset.balance : 0n;
  const existingBorrowValue: bigint =
    (existinBorrowBalance * cometData.baseAsset.price) / BigInt(10 ** cometData.baseAsset.decimals);
  const v3BorrowValue = existingBorrowValue + v2ToV3MigrateBorrowValue;

  const displayV3BorrowValue = formatTokenBalance(PRICE_PRECISION, v3BorrowValue, false, true);

  const v2ToV3MigrateCollateralValue = aTokens.reduce((acc, [, { aToken, balance, price, transfer }]) => {
    const maybeTransfer = transfer === 'max' ? balance : maybeBigIntFromString(transfer, aToken.decimals);
    const transferBigInt = maybeTransfer === undefined ? 0n : maybeTransfer > balance ? balance : maybeTransfer;
    return acc + (transferBigInt * price) / BigInt(10 ** aToken.decimals);
  }, BigInt(0));
  const v3CollateralValuePreMigrate = cometData.collateralAssets.reduce((acc, { balance, decimals, price }) => {
    return acc + (balance * price) / BigInt(10 ** decimals);
  }, BigInt(0));

  const v3CollateralValue = v2ToV3MigrateCollateralValue + v3CollateralValuePreMigrate;
  const displayV3CollateralValue = formatTokenBalance(PRICE_PRECISION, v3CollateralValue, false, true);

  const v3BorrowCapacityValue = cometData.collateralAssets.reduce(
    (acc, { address, balance, collateralFactor, decimals, price }) => {
      const maybeAToken = aTokens.find(([, tokenState]) => tokenState.aToken.address === address)?.[1];
      const maybeTransfer =
        maybeAToken === undefined
          ? undefined
          : maybeAToken.transfer === 'max'
          ? maybeAToken.balance
          : maybeBigIntFromString(maybeAToken.transfer, maybeAToken.aToken.decimals);
      const transferBigInt =
        maybeTransfer === undefined
          ? 0n
          : maybeAToken !== undefined && maybeTransfer > maybeAToken.balance
          ? maybeAToken.balance
          : maybeTransfer;

      const dollarValue = ((balance + transferBigInt) * price) / BigInt(10 ** decimals);
      const capacity = (dollarValue * collateralFactor) / BigInt(10 ** FACTOR_PRECISION);

      return acc + capacity;
    },
    BigInt(0)
  );
  const displayV3BorrowCapacity = formatTokenBalance(PRICE_PRECISION, v3BorrowCapacityValue, false, true);

  const v3LiquidationCapacityValue = cometData.collateralAssets.reduce(
    (acc, { address, balance, liquidateCollateralFactor, decimals, price }) => {
      const maybeAToken = aTokens.find(([, tokenState]) => tokenState.aToken.address === address)?.[1];
      const maybeTransfer =
        maybeAToken === undefined
          ? undefined
          : maybeAToken.transfer === 'max'
          ? maybeAToken.balance
          : maybeBigIntFromString(maybeAToken.transfer, maybeAToken.aToken.decimals);
      const transferBigInt =
        maybeTransfer === undefined
          ? 0n
          : maybeAToken !== undefined && maybeTransfer > maybeAToken.balance
          ? maybeAToken.balance
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
    for (let [, { aToken, balance, transfer }] of state.data.aTokens.entries()) {
      const collateralAsset = cometData.collateralAssets.find(asset => asset.address === aToken.address);

      if (!collateralAsset) {
        continue;
      }

      if (transfer === 'max') {
        if (collateralAsset.totalSupply + balance > collateralAsset.supplyCap) {
          return undefined;
        }

        collateral.push({
          aToken: aToken.aTokenAddress,
          amount: balance
        });
      } else {
        const maybeTransfer = maybeBigIntFromString(transfer, aToken.decimals);
        if (maybeTransfer !== undefined && maybeTransfer > balance) {
          return undefined;
        } else if (
          maybeTransfer !== undefined &&
          collateralAsset.totalSupply + maybeTransfer > collateralAsset.supplyCap
        ) {
          return undefined;
        }

        if (maybeTransfer === undefined) {
          return undefined;
        } else {
          if (maybeTransfer > 0n) {
            collateral.push({
              aToken: aToken.aTokenAddress,
              amount: maybeTransfer
            });
          }
        }
      }
    }

    const borrows: Borrow[] = [];
    for (let [
      ,
      { aToken, borrowBalanceStable, borrowBalanceVariable, repayAmountStable, repayAmountVariable }
    ] of state.data.aTokens.entries()) {
      if (repayAmountStable === '' && repayAmountVariable === '') {
        continue;
      }

      if (repayAmountStable === 'max') {
        borrows.push({
          aDebtToken: aToken.stableDebtTokenAddress,
          amount: MAX_UINT256
        });
      } else if (repayAmountStable !== '') {
        const maybeRepayAmount = maybeBigIntFromString(repayAmountStable, aToken.decimals);
        if (maybeRepayAmount !== undefined && maybeRepayAmount > borrowBalanceStable) {
          return undefined;
        }

        if (maybeRepayAmount === undefined) {
          return undefined;
        } else {
          if (maybeRepayAmount > 0n) {
            borrows.push({
              aDebtToken: aToken.stableDebtTokenAddress,
              amount: maybeRepayAmount
            });
          }
        }
      }

      if (repayAmountVariable === 'max') {
        borrows.push({
          aDebtToken: aToken.variableDebtTokenAddress,
          amount: MAX_UINT256
        });
      } else if (repayAmountVariable !== '') {
        const maybeRepayAmount = maybeBigIntFromString(repayAmountVariable, aToken.decimals);
        if (maybeRepayAmount !== undefined && maybeRepayAmount > borrowBalanceVariable) {
          return undefined;
        }

        if (maybeRepayAmount === undefined) {
          return undefined;
        } else {
          if (maybeRepayAmount > 0n) {
            borrows.push({
              aDebtToken: aToken.variableDebtTokenAddress,
              amount: maybeRepayAmount
            });
          }
        }
      }
    }

    const swaps: Swap[] = [];
    for (let [
      symbol,
      {
        aToken,
        borrowBalanceStable,
        borrowBalanceVariable,
        repayAmountStable,
        repayAmountVariable,
        swapRouteStable,
        swapRouteVariable
      }
    ] of state.data.aTokens.entries()) {
      const maybeRepayAmountStable =
        repayAmountStable === 'max' ? borrowBalanceStable : maybeBigIntFromString(repayAmountStable, aToken.decimals);
      const maybeRepayAmountVariable =
        repayAmountVariable === 'max'
          ? borrowBalanceVariable
          : maybeBigIntFromString(repayAmountVariable, aToken.decimals);

      if (maybeRepayAmountStable !== undefined && maybeRepayAmountStable > 0n) {
        if (aToken.symbol === cometData.baseAsset.symbol) {
          swaps.push({
            path: '0x',
            amountInMaximum: MAX_UINT256
          });
        } else if (swapRouteStable !== undefined && swapRouteStable[0] === StateType.Hydrated) {
          swaps.push({
            path: swapRouteStable[1].path,
            amountInMaximum: MAX_UINT256
          });
        } else {
          return undefined;
        }
      }

      if (maybeRepayAmountVariable !== undefined && maybeRepayAmountVariable > 0n) {
        if (aToken.symbol === cometData.baseAsset.symbol) {
          swaps.push({
            path: '0x',
            amountInMaximum: MAX_UINT256
          });
        } else if (swapRouteVariable !== undefined && swapRouteVariable[0] === StateType.Hydrated) {
          swaps.push({
            path: swapRouteVariable[1].path,
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

  let migrateParams = state.data.error ?? validateForm();

  async function migrate() {
    if (migrateParams !== undefined && typeof migrateParams !== 'string') {
      try {
        await trackTransaction(
          migratorTrxKey(migrator.address),
          migrator.migrate([[], [], []], migrateParams[0], migrateParams[1]),
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

  let borrowEl;
  if (aTokensWithBorrowBalances.length > 0) {
    borrowEl = aTokensWithBorrowBalances.map(([sym, tokenState]) => {
      return (
        <>
          {tokenState.borrowBalanceStable > 0n && (
            <AaveBorrowInputView
              baseAsset={cometData.baseAsset}
              borrowType={'stable'}
              tokenState={tokenState}
              onInputChange={(value: string) => {
                dispatch({
                  type: ActionType.SetRepayAmount,
                  payload: { symbol: sym, type: 'stable', repayAmount: value }
                });

                const maybeValueBigInt = maybeBigIntFromString(value, tokenState.aToken.decimals);

                const cacheKey = `stable-${tokenState.aToken.symbol}`;
                if (maybeValueBigInt !== undefined && maybeValueBigInt > 0n) {
                  const prevTimeout = routerCache.get(cacheKey);
                  if (prevTimeout) {
                    clearTimeout(prevTimeout);
                  }

                  dispatch({
                    type: ActionType.SetSwapRoute,
                    payload: { symbol: sym, type: 'stable', swapRoute: [StateType.Loading] }
                  });

                  routerCache.set(
                    cacheKey,
                    setTimeout(() => {
                      getRoute(
                        getIdByNetwork(networkConfig.network),
                        migrator.address,
                        cometData.baseAsset,
                        tokenState,
                        uniswapRouter,
                        maybeValueBigInt
                      )
                        .then(swapInfo => {
                          if (swapInfo !== null) {
                            dispatch({
                              type: ActionType.SetSwapRoute,
                              payload: { symbol: sym, type: 'stable', swapRoute: [StateType.Hydrated, swapInfo] }
                            });
                          }
                        })
                        .catch(e => {
                          dispatch({
                            type: ActionType.SetSwapRoute,
                            payload: { symbol: sym, type: 'stable', swapRoute: undefined }
                          });
                        });
                    }, 300)
                  );
                } else {
                  const prevTimeout = routerCache.get(cacheKey);
                  if (prevTimeout) {
                    clearTimeout(prevTimeout);
                  }
                  dispatch({
                    type: ActionType.SetSwapRoute,
                    payload: { symbol: sym, type: 'stable', swapRoute: undefined }
                  });
                }
              }}
              onMaxButtonClicked={() => {
                dispatch({
                  type: ActionType.SetRepayAmount,
                  payload: { symbol: sym, type: 'stable', repayAmount: 'max' }
                });

                if (tokenState.aToken.symbol !== cometData.baseAsset.symbol) {
                  dispatch({
                    type: ActionType.SetSwapRoute,
                    payload: { symbol: sym, type: 'stable', swapRoute: [StateType.Loading] }
                  });

                  getRoute(
                    getIdByNetwork(networkConfig.network),
                    migrator.address,
                    cometData.baseAsset,
                    tokenState,
                    uniswapRouter,
                    tokenState.borrowBalanceStable
                  )
                    .then(swapInfo => {
                      if (swapInfo !== null) {
                        dispatch({
                          type: ActionType.SetSwapRoute,
                          payload: { symbol: sym, type: 'stable', swapRoute: [StateType.Hydrated, swapInfo] }
                        });
                      }
                    })
                    .catch(e => {
                      dispatch({
                        type: ActionType.SetSwapRoute,
                        payload: { symbol: sym, type: 'stable', swapRoute: undefined }
                      });
                    });
                }
              }}
            />
          )}
          {tokenState.borrowBalanceVariable > 0n && (
            <AaveBorrowInputView
              baseAsset={cometData.baseAsset}
              borrowType={'variable'}
              tokenState={tokenState}
              onInputChange={(value: string) => {
                dispatch({
                  type: ActionType.SetRepayAmount,
                  payload: { symbol: sym, type: 'variable', repayAmount: value }
                });

                if (tokenState.aToken.address !== cometData.baseAsset.address) {
                  const maybeValueBigInt = maybeBigIntFromString(value, tokenState.aToken.decimals);

                  const cacheKey = `variable-${tokenState.aToken.symbol}`;
                  if (maybeValueBigInt !== undefined) {
                    const prevTimeout = routerCache.get(cacheKey);
                    if (prevTimeout) {
                      clearTimeout(prevTimeout);
                    }

                    dispatch({
                      type: ActionType.SetSwapRoute,
                      payload: { symbol: sym, type: 'variable', swapRoute: [StateType.Loading] }
                    });

                    routerCache.set(
                      cacheKey,
                      setTimeout(() => {
                        getRoute(
                          getIdByNetwork(networkConfig.network),
                          migrator.address,
                          cometData.baseAsset,
                          tokenState,
                          uniswapRouter,
                          maybeValueBigInt
                        )
                          .then(swapInfo => {
                            if (swapInfo !== null) {
                              dispatch({
                                type: ActionType.SetSwapRoute,
                                payload: { symbol: sym, type: 'variable', swapRoute: [StateType.Hydrated, swapInfo] }
                              });
                            }
                          })
                          .catch(e => {
                            dispatch({
                              type: ActionType.SetSwapRoute,
                              payload: { symbol: sym, type: 'variable', swapRoute: undefined }
                            });
                          });
                      }, 300)
                    );
                  } else {
                    const prevTimeout = routerCache.get(cacheKey);
                    if (prevTimeout) {
                      clearTimeout(prevTimeout);
                    }
                    dispatch({
                      type: ActionType.SetSwapRoute,
                      payload: { symbol: sym, type: 'variable', swapRoute: undefined }
                    });
                  }
                }
              }}
              onMaxButtonClicked={() => {
                dispatch({
                  type: ActionType.SetRepayAmount,
                  payload: { symbol: sym, type: 'variable', repayAmount: 'max' }
                });

                if (tokenState.aToken.symbol !== cometData.baseAsset.symbol) {
                  dispatch({
                    type: ActionType.SetSwapRoute,
                    payload: { symbol: sym, type: 'variable', swapRoute: [StateType.Loading] }
                  });

                  getRoute(
                    getIdByNetwork(networkConfig.network),
                    migrator.address,
                    cometData.baseAsset,
                    tokenState,
                    uniswapRouter,
                    tokenState.borrowBalanceVariable
                  )
                    .then(swapInfo => {
                      if (swapInfo !== null) {
                        dispatch({
                          type: ActionType.SetSwapRoute,
                          payload: { symbol: sym, type: 'variable', swapRoute: [StateType.Hydrated, swapInfo] }
                        });
                      }
                    })
                    .catch(e => {
                      dispatch({
                        type: ActionType.SetSwapRoute,
                        payload: { symbol: sym, type: 'variable', swapRoute: undefined }
                      });
                    });
                }
              }}
            />
          )}
        </>
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
      const collateralAsset = cometData.collateralAssets.find(asset => asset.symbol === tokenState.aToken.symbol);

      if (tokenState.transfer === 'max') {
        transfer = formatTokenBalance(tokenState.aToken.decimals, tokenState.balance, false);
        transferDollarValue = formatTokenBalance(
          tokenState.aToken.decimals + PRICE_PRECISION,
          tokenState.balance * tokenState.price,
          false,
          true
        );

        if (
          collateralAsset !== undefined &&
          tokenState.balance + collateralAsset.totalSupply > collateralAsset.supplyCap
        ) {
          [errorTitle, errorDescription] = supplyCapError(collateralAsset);
        }
      } else {
        const maybeTransfer = maybeBigIntFromString(tokenState.transfer, tokenState.aToken.decimals);

        if (maybeTransfer === undefined) {
          transfer = tokenState.transfer;
          transferDollarValue = '$0.00';
        } else {
          transfer = tokenState.transfer;
          transferDollarValue = formatTokenBalance(
            tokenState.aToken.decimals + PRICE_PRECISION,
            maybeTransfer * tokenState.price,
            false,
            true
          );

          if (maybeTransfer > tokenState.balance) {
            errorTitle = 'Amount Exceeds Balance.';
            errorDescription = `Value must be less than or equal to ${formatTokenBalance(
              tokenState.aToken.decimals,
              tokenState.balance,
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

      const key = tokenApproveTrxKey(tokenState.aToken.aTokenAddress, migrator.address);

      return (
        <div className="migrator__input-view" key={key}>
          <div className="migrator__input-view__content">
            <div className="migrator__input-view__left">
              <div className="migrator__input-view__header">
                <div className={`asset asset--${tokenState.aToken.symbol}`}></div>
                <label className="L2 label text-color--1">{tokenState.aToken.symbol}</label>
              </div>
              <div className="migrator__input-view__holder">
                <input
                  placeholder="0.0000"
                  value={transfer}
                  onChange={e =>
                    dispatch({
                      type: ActionType.SetTransferForAToken,
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
                        name: tokenState.aToken.symbol,
                        symbol: tokenState.aToken.symbol
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
                    dispatch({ type: ActionType.SetTransferForAToken, payload: { symbol: sym, transfer: 'max' } })
                  }
                >
                  Max
                </button>
              )}
              <p className="meta text-color--2" style={{ marginTop: '0.5rem' }}>
                <span style={{ fontWeight: '500' }}>Aave V2 balance:</span>{' '}
                {formatTokenBalance(tokenState.aToken.decimals, tokenState.balance, false)}
              </p>
              <p className="meta text-color--2">
                {formatTokenBalance(
                  tokenState.aToken.decimals + PRICE_PRECISION,
                  tokenState.balance * tokenState.price,
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
                Select a source and the balances you want to migrate to Compound V3. If you are supplying{' '}
                {cometData.baseAsset.symbol} on one market while borrowing on the other, your ending balance will be the
                net of these two balances.
              </p>
              <div className="migrator__balances__section">
                <label className="L1 label text-color--2 migrator__balances__section__header">Source</label>
                <Dropdown
                  options={Object.values(MigrationSource).map(source => [
                    source,
                    migrationSourceToDisplayString(source)
                  ])}
                  selectedOption={migrationSourceToDisplayString(MigrationSource.AaveV2)}
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
                          {displayV2UnsupportedCollateralValue} of Aave V2 collateral value cannot be migrated due to
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
                If you are borrowing other assets on Aave V2, migrating too much collateral could increase your
                liquidation risk.
              </p>
              <div className="migrator__summary__section">
                <label className="L1 label text-color--2 migrator__summary__section__header">{`Aave V2 Position${
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

async function getRoute(
  networkId: number,
  migrator: string,
  baseAsset: BaseAssetWithAccountState,
  tokenState: ATokenState,
  uniswapRouter: AlphaRouter,
  outputAmount: bigint
): Promise<SwapInfo | null> {
  const BASE_ASSET = new Token(networkId, baseAsset.address, baseAsset.decimals, baseAsset.symbol, baseAsset.name);
  const token = new Token(
    networkId,
    tokenState.aToken.address,
    tokenState.aToken.decimals,
    tokenState.aToken.symbol,
    tokenState.aToken.symbol
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
        symbol: tokenState.aToken.symbol,
        decimals: tokenState.aToken.decimals,
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
