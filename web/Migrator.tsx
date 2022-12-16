import '../styles/main.scss';

import { CometState } from '@compound-finance/comet-extension';
import { StateType as CometStateType } from '@compound-finance/comet-extension/dist/CometState';
import { Contract } from '@ethersproject/contracts';
import { JsonRpcProvider } from '@ethersproject/providers';
import { AlphaRouter } from '@uniswap/smart-order-router';
import { ReactNode, useMemo, useReducer, useState } from 'react';

import ERC20 from '../abis/ERC20';

import ApproveModal from './components/ApproveModal';
import { InputViewError, notEnoughLiquidityError, supplyCapError } from './components/ErrorViews';
import { ArrowRight, CircleExclamation } from './components/Icons';
import { LoadingView } from './components/LoadingViews';

import { formatTokenBalance, maybeBigIntFromString, PRICE_PRECISION } from './helpers/numbers';
import {
  migratorTrxKey,
  tokenApproveTrxKey,
  migrationSourceToDisplayString,
  stableCoins,
  getFormattedDisplayData,
  validateForm,
  getRoute,
  approve,
  migrate
} from './helpers/utils';

import { useAsyncEffect } from './lib/useAsyncEffect';
import { usePoll } from './lib/usePoll';
import {
  hasAwaitingConfirmationTransaction,
  hasPendingTransaction,
  useTransactionTracker
} from './lib/useTransactionTracker';

import { getIdByNetwork } from './Network';
import {
  AppProps,
  ApproveModalProps,
  MigrationSource,
  StateType,
  SwapRouteState,
  MigrateBorrowTokenState,
  MigrateCollateralTokenState,
  MigrationSourceInfo
} from './types';
import SwapDropdown from './components/SwapDropdown';
import Dropdown from './components/Dropdown';

type MigratorProps = AppProps & {
  account: string;
  cometState: CometState;
  migrationSourceInfo: MigrationSourceInfo;
  getMigrateData: (
    web3: JsonRpcProvider,
    migrationSourceInfo: MigrationSourceInfo,
    migratorState: MigratorState
  ) => Promise<{
    migratorEnabled: boolean;
    borrowTokens: MigrateBorrowTokenState[];
    collateralTokens: MigrateCollateralTokenState[];
  }>;
  selectMigratorSource: (source: MigrationSource) => void;
};

export interface MigratorStateData {
  error: string | null;
  migratorEnabled: boolean;
  borrowTokens: MigrateBorrowTokenState[];
  collateralTokens: MigrateCollateralTokenState[];
}

export type MigratorStateLoading = { type: StateType.Loading; data: { error: null | string } };
export type MigratorStateHydrated = {
  type: StateType.Hydrated;
  data: MigratorStateData;
};
export type MigratorState = MigratorStateLoading | MigratorStateHydrated;

enum ActionType {
  ClearRepayAndTransferAmounts = 'clear-amounts',
  SetAccountState = 'set-account-state',
  SetError = 'set-error',
  SetRepayAmount = 'set-repay-amount',
  SetSwapRoute = 'set-swap-route',
  SetTransferForCollateralToken = 'set-transfer-for-collateral-token'
}

type ActionSetAccountState = {
  type: ActionType.SetAccountState;
  payload: {
    migratorEnabled: boolean;
    borrowTokens: MigrateBorrowTokenState[];
    collateralTokens: MigrateCollateralTokenState[];
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
    address: string;
    repayAmount: string;
  };
};
type ActionSetSwapRoute = {
  type: ActionType.SetSwapRoute;
  payload: {
    address: string;
    swapRoute: SwapRouteState;
  };
};
type ActionSetTransferForCollateralToken = {
  type: ActionType.SetTransferForCollateralToken;
  payload: {
    address: string;
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
  | ActionSetTransferForCollateralToken;

function reducer(state: MigratorState, action: Action): MigratorState {
  switch (action.type) {
    case ActionType.ClearRepayAndTransferAmounts: {
      if (state.type !== StateType.Hydrated) return state;

      const borrowTokens: MigrateBorrowTokenState[] = state.data.borrowTokens.map(tokenState => {
        return {
          ...tokenState,
          repayAmount: ''
        };
      });

      const collateralTokens: MigrateCollateralTokenState[] = state.data.collateralTokens.map(tokenState => {
        return {
          ...tokenState,
          transfer: ''
        };
      });

      return {
        type: StateType.Hydrated,
        data: {
          ...state.data,
          error: null,
          borrowTokens,
          collateralTokens
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

      const borrowTokens: MigrateBorrowTokenState[] = state.data.borrowTokens.map(tokenState => {
        return tokenState.address === action.payload.address
          ? {
              ...tokenState,
              repayAmount: action.payload.repayAmount
            }
          : tokenState;
      });

      return {
        type: StateType.Hydrated,
        data: {
          ...state.data,
          error: null,
          borrowTokens
        }
      };
    }
    case ActionType.SetSwapRoute: {
      if (state.type !== StateType.Hydrated) return state;

      const borrowTokens: MigrateBorrowTokenState[] = state.data.borrowTokens.map(tokenState => {
        return tokenState.address === action.payload.address
          ? {
              ...tokenState,
              swapRoute: action.payload.swapRoute
            }
          : tokenState;
      });

      return {
        type: StateType.Hydrated,
        data: {
          ...state.data,
          error: null,
          borrowTokens
        }
      };
    }
    case ActionType.SetTransferForCollateralToken: {
      if (state.type !== StateType.Hydrated) return state;

      const collateralTokens: MigrateCollateralTokenState[] = state.data.collateralTokens.map(tokenState => {
        return tokenState.address === action.payload.address
          ? {
              ...tokenState,
              transfer: action.payload.transfer
            }
          : tokenState;
      });

      return {
        type: StateType.Hydrated,
        data: {
          ...state.data,
          error: null,
          collateralTokens
        }
      };
    }
  }
}

const initialState: MigratorState = { type: StateType.Loading, data: { error: null } };

export default function Migrator({
  web3,
  account,
  cometState,
  migrationSourceInfo,
  getMigrateData,
  selectMigratorSource
}: MigratorProps) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [approveModal, setApproveModal] = useState<Omit<ApproveModalProps, 'transactionTracker'> | undefined>(
    undefined
  );
  const { tracker, trackTransaction } = useTransactionTracker(web3);

  const [migrationSource, networkConfig] = migrationSourceInfo;

  const timer = usePoll(10000);
  const routerCache = useMemo(() => new Map<string, NodeJS.Timeout>(), [networkConfig.network]);

  const signer = useMemo(() => {
    return web3.getSigner().connectUnchecked();
  }, [web3, account]);

  const migrator = useMemo(() => new Contract(networkConfig.migratorAddress, networkConfig.migratorAbi, signer), [
    signer,
    networkConfig.network
  ]);

  useAsyncEffect(async () => {
    const { borrowTokens, collateralTokens, migratorEnabled } = await getMigrateData(web3, migrationSourceInfo, state);

    dispatch({
      type: ActionType.SetAccountState,
      payload: {
        borrowTokens,
        collateralTokens,
        migratorEnabled
      }
    });
  }, [timer, tracker, account, networkConfig.network]);

  if (state.type === StateType.Loading || cometState[0] !== CometStateType.Hydrated) {
    return <LoadingView migrationSource={migrationSource} selectMigratorSource={selectMigratorSource} />;
  }
  const cometData = cometState[1];
  const { borrowTokens, collateralTokens, migratorEnabled } = state.data;

  const tokensWithBorrowBalances = borrowTokens.filter(tokenState => {
    return tokenState.borrowBalance > 0n && !!stableCoins.find(coin => coin === tokenState.underlying.symbol);
  });
  const tokensWithCollateralBalances = collateralTokens.filter(tokenState => {
    const v3CollateralAsset = cometData.collateralAssets.find(asset => asset.symbol === tokenState.underlying.symbol);
    return (
      (v3CollateralAsset !== undefined || tokenState.underlying.symbol === cometData.baseAsset.symbol) &&
      tokenState.balance > 0n
    );
  });

  const {
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
  } = getFormattedDisplayData({ borrowTokens, collateralTokens, cometData });
  const displayMigrationSource = migrationSourceToDisplayString(migrationSource);

  const migrateParams =
    state.data.error ??
    validateForm({
      borrowTokens,
      collateralTokens,
      cometData,
      migratorEnabled,
      migrationSource,
      v2BorrowCapacity,
      v2BorrowValue,
      v2ToV3MigrateBorrowValue,
      v3BorrowCapacityValue,
      v3BorrowValue,
      stateType: state.type
    });
  console.log('MIgrate Params', migrateParams);

  const quoteProvider = import.meta.env.VITE_BYPASS_MAINNET_RPC_URL
    ? new JsonRpcProvider(import.meta.env.VITE_BYPASS_MAINNET_RPC_URL)
    : web3;
  const uniswapRouter = new AlphaRouter({ chainId: getIdByNetwork(networkConfig.network), provider: quoteProvider });

  let borrowEl;
  if (tokensWithBorrowBalances.length > 0) {
    borrowEl = tokensWithBorrowBalances.map(tokenState => {
      let repayAmount: string;
      let repayAmountDollarValue: string;
      let errorTitle: string | undefined;
      let errorDescription: string | undefined;

      if (tokenState.repayAmount === 'max') {
        repayAmount = formatTokenBalance(tokenState.underlying.decimals, tokenState.borrowBalance, false);
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
        <div className="migrator__input-view" key={tokenState.address}>
          <div className="migrator__input-view__content">
            <div className="migrator__input-view__left">
              <div className="migrator__input-view__header">
                <div className={`asset asset--${tokenState.underlying.symbol}`}></div>
                <label className="L2 label text-color--1">
                  {tokenState.underlying.symbol}{' '}
                  {!!tokenState.borrowType && (
                    <span className="text-color--2">
                      {tokenState.borrowType === 'stable' ? '(Stable Debt)' : '(Variable Debt)'}
                    </span>
                  )}
                </label>
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
                      payload: { address: tokenState.address, repayAmount: e.target.value }
                    });

                    if (tokenState.underlying.address !== cometData.baseAsset.address) {
                      const maybeValueBigInt = maybeBigIntFromString(e.target.value, tokenState.underlying.decimals);

                      const cacheKey = tokenState.underlying.symbol;
                      if (maybeValueBigInt !== undefined && maybeValueBigInt > 0n) {
                        const prevTimeout = routerCache.get(cacheKey);
                        if (prevTimeout) {
                          clearTimeout(prevTimeout);
                        }

                        dispatch({
                          type: ActionType.SetSwapRoute,
                          payload: { address: tokenState.address, swapRoute: [StateType.Loading] }
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
                                    payload: { address: tokenState.address, swapRoute: [StateType.Hydrated, swapInfo] }
                                  });
                                }
                              })
                              .catch(e => {
                                dispatch({
                                  type: ActionType.SetSwapRoute,
                                  payload: {
                                    address: tokenState.address,
                                    swapRoute: [StateType.Error, 'Failed to fetch prices']
                                  }
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
                          payload: { address: tokenState.address, swapRoute: undefined }
                        });
                      }
                    }
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
                  dispatch({
                    type: ActionType.SetRepayAmount,
                    payload: { address: tokenState.address, repayAmount: 'max' }
                  });

                  if (tokenState.underlying.symbol !== cometData.baseAsset.symbol) {
                    dispatch({
                      type: ActionType.SetSwapRoute,
                      payload: { address: tokenState.address, swapRoute: [StateType.Loading] }
                    });

                    getRoute(
                      getIdByNetwork(networkConfig.network),
                      migrator.address,
                      cometData.baseAsset,
                      tokenState,
                      uniswapRouter,
                      tokenState.borrowBalance
                    )
                      .then(swapInfo => {
                        if (swapInfo !== null) {
                          dispatch({
                            type: ActionType.SetSwapRoute,
                            payload: { address: tokenState.address, swapRoute: [StateType.Hydrated, swapInfo] }
                          });
                        }
                      })
                      .catch(e => {
                        dispatch({
                          type: ActionType.SetSwapRoute,
                          payload: {
                            address: tokenState.address,
                            swapRoute: [StateType.Error, 'Failed to fetch prices']
                          }
                        });
                      });
                  }
                }}
              >
                Max
              </button>
              <p className="meta text-color--2" style={{ marginTop: '0.5rem' }}>
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
          <SwapDropdown
            baseAsset={cometData.baseAsset}
            state={tokenState.swapRoute}
            onRefetchClicked={() => {
              const maybeValueBigInt = maybeBigIntFromString(repayAmount, tokenState.underlying.decimals);

              const cacheKey = tokenState.underlying.symbol;
              if (maybeValueBigInt !== undefined && maybeValueBigInt > 0n) {
                const prevTimeout = routerCache.get(cacheKey);
                if (prevTimeout) {
                  clearTimeout(prevTimeout);
                }

                dispatch({
                  type: ActionType.SetSwapRoute,
                  payload: { address: tokenState.address, swapRoute: [StateType.Loading] }
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
                            payload: { address: tokenState.address, swapRoute: [StateType.Hydrated, swapInfo] }
                          });
                        }
                      })
                      .catch(e => {
                        dispatch({
                          type: ActionType.SetSwapRoute,
                          payload: {
                            address: tokenState.address,
                            swapRoute: [StateType.Error, 'Failed to fetch prices']
                          }
                        });
                      });
                  }, 300)
                );
              }
            }}
          />
          {!!errorTitle && <InputViewError title={errorTitle} description={errorDescription} />}
        </div>
      );
    });
  }

  let collateralEl = null;
  if (tokensWithCollateralBalances.length > 0) {
    collateralEl = tokensWithCollateralBalances.map(tokenState => {
      let transfer: string;
      let transferDollarValue: string;
      let errorTitle: string | undefined;
      let errorDescription: string | undefined;
      const disabled = tokenState.allowance === 0n;
      const collateralAsset = cometData.collateralAssets.find(asset => asset.symbol === tokenState.underlying.symbol);

      if (tokenState.underlying.symbol === 'UNI') {
        console.log(
          tokenState.underlying.decimals,
          tokenState.balanceUnderlying,
          formatTokenBalance(tokenState.underlying.decimals, tokenState.balanceUnderlying, false)
        );
      }

      if (tokenState.transfer === 'max') {
        transfer = formatTokenBalance(tokenState.underlying.decimals, tokenState.balanceUnderlying, false);
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
                      type: ActionType.SetTransferForCollateralToken,
                      payload: { address: tokenState.address, transfer: e.target.value }
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
                      onActionClicked: (_asset, _descption) =>
                        approve({
                          migratorAddress: networkConfig.migratorAddress,
                          token: new Contract(tokenState.address, ERC20, signer),
                          trackTransaction
                        }),
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
                  onClick={() => {
                    console.log('token state', tokenState);

                    dispatch({
                      type: ActionType.SetTransferForCollateralToken,
                      payload: { address: tokenState.address, transfer: 'max' }
                    });
                  }}
                >
                  Max
                </button>
              )}
              <p className="meta text-color--2" style={{ marginTop: '0.5rem' }}>
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
                  selectedOption={migrationSourceToDisplayString(migrationSource)}
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
                    {v2UnsupportedBorrowValue > 0n && (
                      <div className="migrator__balances__alert" style={{ marginTop: '1rem' }}>
                        <CircleExclamation className="svg--icon--2" />
                        <p className="meta text-color--2">
                          {displayV2UnsupportedBorrowValue} of non-stable {displayMigrationSource} borrow value
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="migrator__balances__section">
                    <label className="L1 label text-color--2 migrator__balances__section__header">Supplying</label>
                    {collateralEl}
                    {v2UnsupportedCollateralValue > 0n && (
                      <div
                        className="migrator__balances__alert"
                        style={{ marginTop: tokensWithCollateralBalances.length > 0 ? '1rem' : '0rem' }}
                      >
                        <CircleExclamation className="svg--icon--2" />
                        <p className="meta text-color--2">
                          {displayV2UnsupportedCollateralValue} of {displayMigrationSource} collateral value cannot be
                          migrated due to unsupported collateral in Compound V3.
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
                If you are borrowing other assets on {displayMigrationSource}, migrating too much collateral could
                increase your liquidation risk.
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
                onClick={() => {
                  migrate({
                    migrationSource,
                    migrator: new Contract(networkConfig.migratorAddress, networkConfig.migratorAbi, signer),
                    migrateParams,
                    trackTransaction,
                    failureCallback: error => {
                      dispatch({
                        type: ActionType.SetError,
                        payload: {
                          error
                        }
                      });
                    },
                    successCallback: () => {
                      dispatch({ type: ActionType.ClearRepayAndTransferAmounts });
                    }
                  });
                }}
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
