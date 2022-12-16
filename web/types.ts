import { RPC } from '@compound-finance/comet-extension';
import { TransactionReceipt, JsonRpcProvider } from '@ethersproject/providers';

import mainnetV3Roots from '../node_modules/comet/deployments/mainnet/usdc/roots.json';
import mainnetV2Roots from '../node_modules/compound-config/networks/mainnet.json';

import cometMigratorAbi from '../abis/CometMigratorV2';

import { mainnetAaveTokens, mainnetCompoundTokens } from './helpers/utils';

type ConstTupleItems<Tuple extends readonly [...any]> = Tuple[Exclude<keyof Tuple, keyof Array<any>>];

export const networks = ['mainnet'] as const;
export type Network = ConstTupleItems<typeof networks>;
export const mainnet: Network = networks[0];

export type ATokenSym<Network> = Network extends 'mainnet' ? ConstTupleItems<typeof mainnetAaveTokens> : never;

export type CTokenSym<Network> = Network extends 'mainnet' ? ConstTupleItems<typeof mainnetCompoundTokens> : never;

export type RootsV2<Network> = Network extends 'mainnet' ? typeof mainnetV2Roots.Contracts : never;

export type RootsV3<Network> = Network extends 'mainnet' ? typeof mainnetV3Roots : never;

export interface CToken<Network> {
  address: string;
  decimals: number;
  name: string;
  symbol: CTokenSym<Network>;
  underlying: {
    address: string;
    decimals: number;
    name: string;
    symbol: string;
  };
}

export interface AToken {
  aTokenAddress: string;
  aTokenSymbol: ATokenSym<Network>;
  stableDebtTokenAddress: string;
  variableDebtTokenAddress: string;
  symbol: string;
  address: string;
  decimals: number;
}

export interface CompoundNetworkConfig<Network> {
  network: Network;
  comptrollerAddress: string;
  migratorAddress: string;
  migratorAbi: typeof cometMigratorAbi;
  cTokens: CToken<Network>[];
  rootsV2: RootsV2<Network>;
  rootsV3: RootsV3<Network>;
}

export interface AaveNetworkConfig<Network> {
  aTokens: AToken[];
  lendingPoolAddressesProviderAddress: string;
  lendingPoolAddress: string;
  migratorAbi: typeof cometMigratorAbi;
  migratorAddress: string;
  network: Network;
  rootsV3: RootsV3<Network>;
}

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

export type MigrateBorrowTokenState = {
  address: string;
  borrowBalance: bigint;
  borrowType?: 'stable' | 'variable';
  decimals: number;
  name: string;
  price: bigint;
  repayAmount: string | 'max';
  swapRoute: SwapRouteState;
  symbol: string;
  underlying: {
    address: string;
    decimals: number;
    name: string;
    symbol: string;
  };
};

export type MigrateCollateralTokenState = {
  address: string;
  allowance: bigint;
  balance: bigint;
  balanceUnderlying: bigint;
  collateralFactor: bigint;
  decimals: number;
  exchangeRate?: bigint;
  name: string;
  price: bigint;
  symbol: string;
  transfer: string | 'max';
  underlying: {
    address: string;
    decimals: number;
    name: string;
    symbol: string;
  };
};

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

export type MigrationSourceInfoAave = [MigrationSource.AaveV2, AaveNetworkConfig<Network>];
export type MigrationSourceInfoCompound = [MigrationSource.CompoundV2, CompoundNetworkConfig<Network>];
export type MigrationSourceInfo = MigrationSourceInfoAave | MigrationSourceInfoCompound;
