import { RPC } from '@compound-finance/comet-extension';
import { TransactionReceipt, JsonRpcProvider } from '@ethersproject/providers';

import { AToken } from './Network';

export type Token = {
  name: string;
  symbol: string;
};

export type Tracker = Map<string, undefined | Transaction>;

export enum TransactionState {
  AwaitingConfirmation = 'awaitingConfirmation',
  Pending = 'pending',
  Success = 'success',
  Reverted = 'reverted'
}

export type BaseTransaction = {
  key: string;
};

export type AwaitingConfirmationTransaction = BaseTransaction & {
  state: TransactionState.AwaitingConfirmation;
};
export type PendingTransaction = BaseTransaction & {
  state: TransactionState.Pending;
  hash: string;
};
export type FinalizedTransaction = BaseTransaction & {
  state: TransactionState.Success | TransactionState.Reverted;
  hash: string;
  receipt: TransactionReceipt;
};

export type Transaction = AwaitingConfirmationTransaction | PendingTransaction | FinalizedTransaction;

export type ApproveModalProps = {
  asset: Token;
  transactionTracker: Tracker;
  transactionKey: string;
  onActionClicked: (asset: Token, description: string) => void;
  onRequestClose: () => void;
};

export enum MigrationSource {
  AaveV2 = 'aave-v2',
  CompoundV2 = 'compound-v2'
}

export enum StateType {
  Error = 'error',
  Loading = 'loading',
  Hydrated = 'hydrated'
}

export interface AppProps {
  rpc?: RPC;
  web3: JsonRpcProvider;
}
export type SwapRouteState =
  | undefined
  | [StateType.Loading]
  | [StateType.Error, string]
  | [StateType.Hydrated, SwapInfo];

export interface ATokenState {
  aToken: AToken;
  allowance: bigint;
  balance: bigint;
  borrowBalanceStable: bigint;
  borrowBalanceVariable: bigint;
  collateralFactor: bigint;
  price: bigint;
  repayAmountStable: string | 'max';
  repayAmountVariable: string | 'max';
  transfer: string | 'max';
  swapRouteStable: SwapRouteState;
  swapRouteVariable: SwapRouteState;
}

export type SwapInfo = {
  tokenIn: {
    symbol: string;
    decimals: number;
    amount: bigint;
    price: bigint;
  };
  tokenOut: {
    symbol: string;
    decimals: number;
    amount: bigint;
    price: bigint;
  };
  networkFee: string;
  path: string;
};
