import '../styles/main.scss';

import { CometState, RPC } from '@compound-finance/comet-extension';
import { Contract } from '@ethersproject/contracts';
import { JsonRpcProvider } from '@ethersproject/providers';
import { Contract as MulticallContract, Provider } from 'ethers-multicall';
import { ReactNode, useEffect, useMemo, useReducer, useState } from 'react';

import Comet from '../abis/Comet';
import Comptroller from '../abis/Comptroller';
import CToken from '../abis/CToken';
import Oracle from '../abis/Oracle';

import ApproveModal from './components/ApproveModal';
import { CircleExclamation } from './components/Icons';

import { formatTokenBalance, getRiskLevelAndPercentage, maybeBigIntFromString } from './helpers/numbers';

import {
  hasAwaitingConfirmationTransaction,
  hasPendingTransaction,
  useTransactionTracker
} from './lib/useTransactionTracker';

import { CTokenSym, Network, NetworkConfig, getIdByNetwork, getNetworkById, getNetworkConfig } from './Network';
import { ApproveModalProps } from './types';

const MAX_UINT256 = BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935');
const FACTOR_PRECISION = 18;
const PRICE_PRECISION = 8;

interface AppProps {
  rpc?: RPC;
  web3: JsonRpcProvider;
}

type AppPropsExt<N extends Network> = AppProps & {
  account: string;
  networkConfig: NetworkConfig<N>;
};

interface Collateral {
  cToken: string;
  amount: bigint;
}

function amountToWei(amount: number, decimals: number): bigint {
  return BigInt(Math.floor(Number(amount) * 10 ** decimals));
}

function usePoll(timeout: number) {
  const [timer, setTimer] = useState(0);

  useEffect(() => {
    let t: NodeJS.Timer;
    function loop(x: number, delay: number) {
      t = setTimeout(() => {
        requestAnimationFrame(() => {
          setTimer(x);
          loop(x + 1, delay);
        });
      }, delay);
    }
    loop(1, timeout);
    return () => clearTimeout(t);
  }, []);

  return timer;
}

function useAsyncEffect(fn: () => Promise<void>, deps: any[] = []) {
  useEffect(() => {
    (async () => {
      await fn();
    })();
  }, deps);
}

function parseNumber(str: string, f: (x: number) => bigint): bigint | null {
  if (str === 'max') {
    return MAX_UINT256;
  } else {
    let num = Number(str);
    if (Number.isNaN(num)) {
      return null;
    } else {
      return f(num);
    }
  }
}

function getDocument(f: (document: Document) => void) {
  if (document.readyState !== 'loading') {
    f(document);
  } else {
    window.addEventListener('DOMContentLoaded', _event => {
      f(document);
    });
  }
}

function migratorTrxKey(migratorAddress: string): string {
  return `migrate_${migratorAddress}`;
}

function tokenApproveTrxKey(tokenAddress: string, approveAddress: string): string {
  return `approve_${tokenAddress}_${approveAddress}`;
}

enum StateType {
  Loading = 'loading',
  Hydrated = 'hydrated'
}

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
  underlyingDecimals: number;
  underlyingName: string;
}

interface MigratorStateData<Network> {
  error: string | null;
  migratorEnabled: boolean;
  cTokens: Map<CTokenSym<Network>, CTokenState>;
}

type MigratorStateLoading = { type: StateType.Loading; data: { error: null | string } };
type MigratorStateHydrated = { type: StateType.Hydrated; data: MigratorStateData<Network> };
type MigratorState = MigratorStateLoading | MigratorStateHydrated;

enum ActionType {
  ClearRepayAndTransferAmounts = 'clear-amounts',
  SetAccountState = 'set-account-state',
  SetError = 'set-error',
  SetRepayAmount = 'set-repay-amount',
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

export function App<N extends Network>({ rpc, web3, account, networkConfig }: AppPropsExt<N>) {
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

  let timer = usePoll(10000);

  const signer = useMemo(() => {
    return web3.getSigner().connectUnchecked();
  }, [web3, account]);

  const cTokenCtxs = useMemo(() => {
    return new Map(
      networkConfig.cTokens.map(({ abi, address, symbol }) => [symbol, new Contract(address, abi ?? [], signer)])
    ) as Map<CTokenSym<Network>, Contract>;
  }, [signer]);

  const migrator = useMemo(() => new Contract(networkConfig.migratorAddress, networkConfig.migratorAbi, signer), [
    signer
  ]);
  const comet = useMemo(() => new MulticallContract(networkConfig.rootsV3.comet, Comet), []);
  const comptroller = useMemo(() => new Contract(networkConfig.comptrollerAddress, Comptroller, signer), [signer]);
  const comptrollerRead = useMemo(() => new MulticallContract(networkConfig.comptrollerAddress, Comptroller), []);
  const oraclePromise = useMemo(async () => {
    const oracleAddress = await comptroller.oracle();
    return new MulticallContract(oracleAddress, Oracle);
  }, [comptrollerRead]);

  const ethcallProvider = useMemo(() => new Provider(web3, getIdByNetwork(networkConfig.network)), [web3]);

  async function setTokenApproval(tokenSym: CTokenSym<Network>) {
    const tokenContract = cTokenCtxs.get(tokenSym)!;
    await trackTransaction(
      tokenApproveTrxKey(tokenContract.address, migrator.address),
      tokenContract.approve(migrator.address, MAX_UINT256)
    );
  }

  useAsyncEffect(async () => {
    const cTokenContracts = networkConfig.cTokens.map(({ address }) => new MulticallContract(address, CToken));
    const oracle = await oraclePromise;

    const balanceCalls = cTokenContracts.map(cTokenContract => cTokenContract.balanceOf(account));
    const borrowBalanceCalls = cTokenContracts.map(cTokenContract => cTokenContract.borrowBalanceCurrent(account));
    const exchangeRateCalls = cTokenContracts.map(cTokenContract => cTokenContract.exchangeRateCurrent());
    const allowanceCalls = cTokenContracts.map(cTokenContract => cTokenContract.allowance(account, migrator.address));
    const collateralFactorCalls = cTokenContracts.map(cTokenContract =>
      comptrollerRead.markets(cTokenContract.address)
    );
    const priceCalls = networkConfig.cTokens.map(cToken => {
      const priceSymbol = cToken.underlyingSymbol === 'WBTC' ? 'BTC' : cToken.underlyingSymbol;
      return oracle.price(priceSymbol);
    });

    const numCtokens = networkConfig.cTokens.length;

    const [migratorEnabled, ...combinedCalls] = await ethcallProvider.all([
      comet.allowance(account, migrator.address),
      ...balanceCalls,
      ...borrowBalanceCalls,
      ...exchangeRateCalls,
      ...allowanceCalls,
      ...collateralFactorCalls,
      ...priceCalls
    ]);

    const balances = combinedCalls.slice(0, numCtokens).map(balance => balance.toBigInt());
    const borrowBalances = combinedCalls
      .slice(numCtokens, numCtokens * 2)
      .map(borrowBalance => borrowBalance.toBigInt());
    const exchangeRates = combinedCalls
      .slice(numCtokens * 2, numCtokens * 3)
      .map(exchangeRate => exchangeRate.toBigInt());
    const allowances = combinedCalls.slice(numCtokens * 3, numCtokens * 4).map(allowance => allowance.toBigInt());
    const collateralFactors = combinedCalls
      .slice(numCtokens * 4, numCtokens * 5)
      .map(([, collateralFactor]) => collateralFactor.toBigInt());
    const prices = combinedCalls.slice(numCtokens * 5, numCtokens * 6).map(price => price.toBigInt() * 100n); // Scale up to match V3 price precision of 1e8

    const tokenStates = new Map(
      networkConfig.cTokens.map((cToken, index) => {
        const maybeTokenState = state.type === StateType.Loading ? undefined : state.data.cTokens.get(cToken.symbol);

        const underlyingDecimals: number = cToken.underlyingDecimals;
        const underlyingName: string = cToken.underlyingName;
        const balance: bigint = balances[index];
        const borrowBalance = borrowBalances[index];
        const exchangeRate: bigint = exchangeRates[index];
        const balanceUnderlying = (balance * exchangeRate) / 1000000000000000000n;
        const allowance: bigint = allowances[index];
        const collateralFactor: bigint = collateralFactors[index];
        const decimals: number = cToken.decimals;
        const repayAmount: string = maybeTokenState?.repayAmount ?? '';
        const transfer: string = maybeTokenState?.transfer ?? '';
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
            underlyingDecimals,
            underlyingName,
            repayAmount,
            transfer
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
    return <LoadingView />;
  }

  const cTokensWithBorrowBalances = Array.from(state.data.cTokens.entries()).filter(([sym, tokenState]) => {
    return tokenState.borrowBalance > 0n && sym === 'cUSDC';
  });
  const collateralWithBalances = Array.from(state.data.cTokens.entries()).filter(([, tokenState]) => {
    return tokenState.balance > 0n;
  });
  const cTokens = Array.from(state.data.cTokens.entries());
  const v2BorrowValue = cTokens.reduce((acc, [, { borrowBalance, underlyingDecimals, price, repayAmount }]) => {
    const maybeRepayAmount =
      repayAmount === 'max' ? borrowBalance : maybeBigIntFromString(repayAmount, underlyingDecimals);
    const repayAmountBigInt =
      maybeRepayAmount === undefined ? 0n : maybeRepayAmount > borrowBalance ? borrowBalance : maybeRepayAmount;
    return acc + ((borrowBalance - repayAmountBigInt) * price) / BigInt(10 ** underlyingDecimals);
  }, BigInt(0));
  const displayV2BorrowValue = formatTokenBalance(PRICE_PRECISION, v2BorrowValue, false, true);

  const v2CollateralValue = cTokens.reduce((acc, [, { balanceUnderlying, underlyingDecimals, price, transfer }]) => {
    const maybeTransfer = transfer === 'max' ? balanceUnderlying : maybeBigIntFromString(transfer, underlyingDecimals);
    const transferBigInt =
      maybeTransfer === undefined ? 0n : maybeTransfer > balanceUnderlying ? balanceUnderlying : maybeTransfer;
    return acc + ((balanceUnderlying - transferBigInt) * price) / BigInt(10 ** underlyingDecimals);
  }, BigInt(0));
  const displayV2CollateralValue = formatTokenBalance(PRICE_PRECISION, v2CollateralValue, false, true);

  const v2BorrowCapacity = cTokens.reduce(
    (acc, [, { balanceUnderlying, collateralFactor, price, transfer, underlyingDecimals }]) => {
      const maybeTransfer =
        transfer === 'max' ? balanceUnderlying : maybeBigIntFromString(transfer, underlyingDecimals);
      const transferBigInt =
        maybeTransfer === undefined ? 0n : maybeTransfer > balanceUnderlying ? balanceUnderlying : maybeTransfer;
      const dollarValue = ((balanceUnderlying - transferBigInt) * price) / BigInt(10 ** underlyingDecimals);
      const capacity = (dollarValue * collateralFactor) / BigInt(10 ** FACTOR_PRECISION);
      return acc + capacity;
    },
    BigInt(0)
  );
  const displayV2BorrowCapacity = formatTokenBalance(PRICE_PRECISION, v2BorrowCapacity, false, true);

  const v2AvailableToBorrow = v2BorrowCapacity - v2BorrowValue;
  const displayV2AvailableToBorrow = formatTokenBalance(PRICE_PRECISION, v2AvailableToBorrow, false, true);

  const cometData = cometState[1];

  const v2ToV3MigrateBorrowValue = cTokens.reduce(
    (acc, [, { borrowBalance, underlyingDecimals, price, repayAmount }]) => {
      const maybeRepayAmount =
        repayAmount === 'max' ? borrowBalance : maybeBigIntFromString(repayAmount, underlyingDecimals);
      const repayAmountBigInt =
        maybeRepayAmount === undefined ? 0n : maybeRepayAmount > borrowBalance ? borrowBalance : maybeRepayAmount;
      return acc + (repayAmountBigInt * price) / BigInt(10 ** underlyingDecimals);
    },
    BigInt(0)
  );
  const existinBorrowBalance = cometData.baseAsset.balance < 0n ? -cometData.baseAsset.balance : 0n;
  const existingBorrowValue: bigint =
    (existinBorrowBalance * cometData.baseAsset.price) / BigInt(10 ** cometData.baseAsset.decimals);
  const v3BorrowValue = existingBorrowValue + v2ToV3MigrateBorrowValue;

  const displayV3BorrowValue = formatTokenBalance(PRICE_PRECISION, v3BorrowValue, false, true);

  const v2ToV3MigrateCollateralValue = cTokens.reduce(
    (acc, [, { balanceUnderlying, underlyingDecimals, price, transfer }]) => {
      const maybeTransfer =
        transfer === 'max' ? balanceUnderlying : maybeBigIntFromString(transfer, underlyingDecimals);
      const transferBigInt =
        maybeTransfer === undefined ? 0n : maybeTransfer > balanceUnderlying ? balanceUnderlying : maybeTransfer;
      return acc + (transferBigInt * price) / BigInt(10 ** underlyingDecimals);
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
      const maybeCToken = cTokens.find(([sym]) => sym.slice(1) === symbol)?.[1];
      const maybeTransfer =
        maybeCToken === undefined
          ? undefined
          : maybeCToken.transfer === 'max'
          ? maybeCToken.balanceUnderlying
          : maybeBigIntFromString(maybeCToken.transfer, maybeCToken.underlyingDecimals);
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
          : maybeBigIntFromString(maybeCToken.transfer, maybeCToken.underlyingDecimals);
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

  function validateForm(): { borrowAmount: bigint; collateral: Collateral[] } | string | undefined {
    if (state.type === StateType.Loading || !state.data.migratorEnabled) {
      return undefined;
    }

    const cUSDC = state.data.cTokens.get('cUSDC' as CTokenSym<Network>);
    if (!cUSDC) {
      return undefined;
    }

    const borrowAmount = cUSDC.borrowBalance;
    if (!borrowAmount) {
      return undefined;
    }

    const repayAmount = parseNumber(cUSDC.repayAmount, n => amountToWei(n, cUSDC.underlyingDecimals));
    if (repayAmount === null) {
      return undefined;
    }
    if (repayAmount !== MAX_UINT256 && repayAmount > borrowAmount) {
      return undefined;
    }

    let collateral: Collateral[] = [];
    for (let [
      ,
      { address, balance, balanceUnderlying, underlyingDecimals, transfer, exchangeRate }
    ] of state.data.cTokens.entries()) {
      if (transfer === 'max') {
        collateral.push({
          cToken: address,
          amount: balance
        });
      } else {
        if (balanceUnderlying && Number(transfer) > balanceUnderlying) {
          return undefined;
        }
        const transferAmount = parseNumber(transfer, n =>
          amountToWei((n * 1e18) / Number(exchangeRate), underlyingDecimals!)
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

    if (v2BorrowValue > v2BorrowCapacity || v3BorrowValue > v3BorrowCapacityValue) {
      return 'Insufficient Collateral';
    }

    if (!hasMigratePosition) {
      return;
    }

    return {
      borrowAmount: repayAmount,
      collateral
    };
  }

  let migrateParams = state.data.error ?? validateForm();

  async function migrate() {
    if (migrateParams !== undefined && typeof migrateParams !== 'string') {
      try {
        await trackTransaction(
          migratorTrxKey(migrator.address),
          migrator.migrate(migrateParams.collateral, migrateParams.borrowAmount),
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

  let borrowEl;
  if (cTokensWithBorrowBalances.length > 0) {
    borrowEl = cTokensWithBorrowBalances.map(([sym, tokenState]) => {
      let repayAmount: string;
      let repayAmountDollarValue: string;
      let errorTitle: string | undefined;
      let errorDescription: string | undefined;
      const disabled = sym !== 'cUSDC';

      if (tokenState.repayAmount === 'max') {
        repayAmount = formatTokenBalance(tokenState.underlyingDecimals, tokenState.borrowBalance);
        repayAmountDollarValue = formatTokenBalance(
          tokenState.underlyingDecimals + PRICE_PRECISION,
          tokenState.borrowBalance * tokenState.price,
          false,
          true
        );
      } else {
        const maybeRepayAmount = maybeBigIntFromString(tokenState.repayAmount, tokenState.underlyingDecimals);

        if (maybeRepayAmount === undefined) {
          repayAmount = tokenState.repayAmount;
          repayAmountDollarValue = '$0.00';
        } else {
          repayAmount = tokenState.repayAmount;
          repayAmountDollarValue = formatTokenBalance(
            tokenState.underlyingDecimals + PRICE_PRECISION,
            maybeRepayAmount * tokenState.price,
            false,
            true
          );

          if (maybeRepayAmount > tokenState.borrowBalance) {
            errorTitle = 'Amount Exceeds Borrow Balance.';
            errorDescription = `Value must be less than or equal to ${formatTokenBalance(
              tokenState.underlyingDecimals,
              tokenState.borrowBalance,
              false
            )}`;
          }
        }
      }

      return (
        <div className="migrator__input-view" key={sym}>
          <div className="migrator__input-view__content">
            <div className="migrator__input-view__left">
              <div className="migrator__input-view__header">
                <div className={`asset asset--${sym.slice(1)}`}></div>
                <label className="L2 label text-color--1">USDC</label>
              </div>
              <div className="migrator__input-view__holder">
                <input
                  placeholder="0.0000"
                  value={repayAmount}
                  onChange={e =>
                    dispatch({ type: ActionType.SetRepayAmount, payload: { symbol: sym, repayAmount: e.target.value } })
                  }
                  type="text"
                  inputMode="decimal"
                  disabled={disabled}
                />
                {tokenState.repayAmount === '' && !disabled && (
                  <div className="migrator__input-view__placeholder text-color--2">
                    <span className="text-color--1">0</span>.0000
                  </div>
                )}
              </div>
              <p className="meta text-color--2" style={{ marginTop: '0.75rem' }}>
                {repayAmountDollarValue}
              </p>
            </div>
            <div className="migrator__input-view__right">
              <button
                className="button button--small"
                disabled={disabled || tokenState.repayAmount === 'max'}
                onClick={() =>
                  dispatch({ type: ActionType.SetRepayAmount, payload: { symbol: sym, repayAmount: 'max' } })
                }
              >
                Max
              </button>
              <p className="meta text-color--2" style={{ marginTop: '0.75rem' }}>
                <span style={{ fontWeight: '500' }}>V2 balance:</span>{' '}
                {formatTokenBalance(tokenState.underlyingDecimals, tokenState.borrowBalance, false)}
              </p>
              <p className="meta text-color--2">
                {formatTokenBalance(
                  tokenState.underlyingDecimals + PRICE_PRECISION,
                  tokenState.borrowBalance * tokenState.price,
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

  let collateralEl;
  if (collateralWithBalances.length === 0) {
    collateralEl = (
      <div className="asset-row asset-row--active L3">
        <p className="L2 text-color--1">Any collateral balances in Compound V2 will appear here.</p>
      </div>
    );
  } else {
    collateralEl = collateralWithBalances.map(([sym, tokenState]) => {
      let transfer: string;
      let transferDollarValue: string;
      let errorTitle: string | undefined;
      let errorDescription: string | undefined;
      const disabled = tokenState.allowance === 0n;
      const tokenSymbol = sym.slice(1);

      if (tokenState.transfer === 'max') {
        transfer = formatTokenBalance(tokenState.underlyingDecimals, tokenState.balanceUnderlying);
        transferDollarValue = formatTokenBalance(
          tokenState.underlyingDecimals + PRICE_PRECISION,
          tokenState.balanceUnderlying * tokenState.price,
          false,
          true
        );
      } else {
        const maybeTransfer = maybeBigIntFromString(tokenState.transfer, tokenState.underlyingDecimals);

        if (maybeTransfer === undefined) {
          transfer = tokenState.transfer;
          transferDollarValue = '$0.00';
        } else {
          transfer = tokenState.transfer;
          transferDollarValue = formatTokenBalance(
            tokenState.underlyingDecimals + PRICE_PRECISION,
            maybeTransfer * tokenState.price,
            false,
            true
          );

          if (maybeTransfer > tokenState.balanceUnderlying) {
            errorTitle = 'Amount Exceeds Balance.';
            errorDescription = `Value must be less than or equal to ${formatTokenBalance(
              tokenState.underlyingDecimals,
              tokenState.balanceUnderlying,
              false
            )}`;
          }
        }
      }

      const key = tokenApproveTrxKey(tokenState.address, migrator.address);

      return (
        <div className="migrator__input-view" key={key}>
          <div className="migrator__input-view__content">
            <div className="migrator__input-view__left">
              <div className="migrator__input-view__header">
                <div className={`asset asset--${tokenSymbol}`}></div>
                <label className="L2 label text-color--1">{tokenSymbol}</label>
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
              <p className="meta text-color--2" style={{ marginTop: '0.75rem' }}>
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
                        name: tokenState.underlyingName,
                        symbol: tokenSymbol
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
                {formatTokenBalance(tokenState.underlyingDecimals, tokenState.balanceUnderlying, false)}
              </p>
              <p className="meta text-color--2">
                {formatTokenBalance(
                  tokenState.underlyingDecimals + PRICE_PRECISION,
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
                <h1 className="heading heading--emphasized">V2 Balances</h1>
              </div>
              <p className="body">
                Select the amounts you want to migrate from Compound V2 to Compound V3. If you are supplying USDC on one
                market while borrowing on the other, any supplied USDC will be used to repay any borrowed USDC before
                entering you into an earning position in Compound V3.
              </p>

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

export default ({ rpc, web3 }: AppProps) => {
  let timer = usePoll(30000);
  const [account, setAccount] = useState<string | null>(null);
  const [networkConfig, setNetworkConfig] = useState<NetworkConfig<Network> | 'unsupported' | null>(null);

  useAsyncEffect(async () => {
    let accounts = await web3.listAccounts();
    if (accounts.length > 0) {
      let [account] = accounts;
      setAccount(account);
    }
  }, [web3, timer]);

  useAsyncEffect(async () => {
    let networkWeb3 = await web3.getNetwork();
    let network = getNetworkById(networkWeb3.chainId);
    if (network) {
      setNetworkConfig(getNetworkConfig(network));
    } else {
      setNetworkConfig('unsupported');
    }
  }, [web3, timer]);

  if (networkConfig && account) {
    if (networkConfig === 'unsupported') {
      return <LoadingView />;
    } else {
      return <App rpc={rpc} web3={web3} account={account} networkConfig={networkConfig} />;
    }
  } else {
    return <LoadingView />;
  }
};

const InputViewError = ({ title, description }: { title: string; description?: string }) => {
  return (
    <div className="migrator__input-view__error">
      <CircleExclamation />
      <p className="meta">
        <span style={{ fontWeight: '500' }}>{title}</span> {description}
      </p>
    </div>
  );
};

const LoadingAsset = () => {
  return (
    <div className="migrator__input-view">
      <div className="migrator__input-view__content">
        <div className="migrator__input-view__left">
          <div className="migrator__input-view__header">
            <span className="placeholder-content" style={{ width: '25%' }}></span>
          </div>
          <h4 className="heading" style={{ marginTop: '1rem' }}>
            <span className="placeholder-content" style={{ width: '40%' }}></span>
          </h4>
          <p className="meta text-color--2" style={{ marginTop: '0.25rem' }}>
            <span className="placeholder-content" style={{ width: '20%' }}></span>
          </p>
        </div>
        <div className="migrator__input-view__right">
          <button className="button button--small" disabled style={{ width: '3rem' }}>
            <span className="placeholder-content" style={{ width: '100%' }}></span>
          </button>
          <p className="meta text-color--2" style={{ marginTop: '0.75rem', width: '7rem' }}>
            <span className="placeholder-content" style={{ width: '100%' }}></span>
          </p>
          <p className="meta text-color--2" style={{ width: '5rem' }}>
            <span className="placeholder-content" style={{ width: '100%' }}></span>
          </p>
        </div>
      </div>
    </div>
  );
};

const LoadingPosition = () => {
  return (
    <div className={`migrator__summary__section`}>
      <label className="L1 label text-color--2 migrator__summary__section__header" style={{ width: '6rem' }}>
        <span className="placeholder-content" style={{ width: '100%' }}></span>
      </label>
      <div className="migrator__summary__section__row">
        <div>
          <p className="meta text-color--2">
            <span className="placeholder-content" style={{ width: '20%' }}></span>
          </p>
          <h4 className="heading heading--emphasized">
            <span className="placeholder-content" style={{ width: '35%' }}></span>
          </h4>
        </div>
      </div>
      <div className="migrator__summary__section__row">
        <div>
          <p className="meta text-color--2">
            <span className="placeholder-content" style={{ width: '27%' }}></span>
          </p>
          <p className="body body--link">
            <span className="placeholder-content" style={{ width: '45%' }}></span>
          </p>
        </div>
        <div>
          <p className="meta text-color--2">
            <span className="placeholder-content" style={{ width: '30%' }}></span>
          </p>
          <p className="body body--link">
            <span className="placeholder-content" style={{ width: '60%' }}></span>
          </p>
        </div>
      </div>
      <div className="migrator__summary__section__row">
        <div>
          <p className="meta text-color--2">
            <span className="placeholder-content" style={{ width: '33%' }}></span>
          </p>
          <p className="body body--link">
            <span className="placeholder-content" style={{ width: '55%' }}></span>
          </p>
        </div>
        <div>
          <p className="meta text-color--2">
            <span className="placeholder-content" style={{ width: '22%' }}></span>
          </p>
          <p className="body body--link">
            <span className="placeholder-content" style={{ width: '50%' }}></span>
          </p>
        </div>
      </div>
      <div className="migrator__summary__section__row">
        <div>
          <p className="meta text-color--2">
            <span className="placeholder-content" style={{ width: '25%' }}></span>
          </p>
          <p className="body body--link">
            <span className="placeholder-content" style={{ width: '55%' }}></span>
          </p>
        </div>
      </div>
      <div className="meter">
        <div className="meter__bar"></div>
      </div>
    </div>
  );
};

const LoadingView = () => {
  return (
    <div className="page migrator">
      <div className="container">
        <div className="migrator__content">
          <div className="migrator__balances">
            <div className="panel L4">
              <div className="panel__header-row">
                <h1 className="heading heading--emphasized">V2 Balances</h1>
              </div>
              <p className="body">
                Select the amounts you want to migrate from Compound V2 to Compound V3. If you are supplying USDC on one
                market while borrowing on the other, any supplied USDC will be used to repay any borrowed USDC before
                entering you into an earning position in Compound V3.
              </p>

              <div className="migrator__balances__section">
                <label className="L1 label text-color--2 migrator__balances__section__header">Borrowing</label>
                <LoadingAsset />
              </div>
              <div className="migrator__balances__section">
                <label className="L1 label text-color--2 migrator__balances__section__header">Supplying</label>
                <LoadingAsset />
                <LoadingAsset />
                <LoadingAsset />
              </div>
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
              <LoadingPosition />
              <LoadingPosition />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
