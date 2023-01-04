import '../styles/main.scss';

import { Sleuth } from '@compound-finance/sleuth';
import { JsonRpcProvider } from '@ethersproject/providers';
import { BigNumber } from 'ethers';
import { useMemo } from 'react';

import CompoundV2Query from './helpers/Sleuth/out/CompoundV2Query.sol/CompoundV2Query.json';

import { cometQueryResponseToCometData } from './helpers/utils';

import Migrator, { MigratorState } from './Migrator';
import {
  AppProps,
  CompoundNetworkConfig,
  CToken,
  CometQueryResponse,
  MigrateBorrowTokenState,
  MigrateCollateralTokenState,
  MigrationSource,
  MigrationSourceInfo,
  Network,
  StateType,
  SwapRouteState
} from './types';

const QUERY = Sleuth.querySol(CompoundV2Query, { queryFunctionName: 'getMigratorData' });

type CompoundV2MigratorProps<N extends Network> = AppProps & {
  account: string;
  networkConfig: CompoundNetworkConfig<N>;
  selectMigratorSource: (source: MigrationSource) => void;
};

type CTokenRequest = {
  cToken: string;
  priceOracleSymbol: string;
};

type CTokenMetadataQueryArgs = [string, string, CTokenRequest[], string, string];
type CTokenMetadata = {
  cToken: string;
  allowance: BigNumber;
  balance: BigNumber;
  balanceUnderlying: BigNumber;
  borrowBalance: BigNumber;
  collateralFactor: BigNumber;
  exchangeRate: BigNumber;
  price: BigNumber;
};
type CompoundV2QueryResponse = {
  migratorEnabled: BigNumber;
  tokens: CTokenMetadata[];
  cometState: CometQueryResponse;
};

export default function CompoundV2Migrator<N extends Network>({
  rpc,
  web3,
  account,
  networkConfig,
  selectMigratorSource
}: CompoundV2MigratorProps<N>) {
  const sleuth = useMemo(() => new Sleuth(web3), [web3]);

  return (
    <Migrator
      rpc={rpc}
      web3={web3}
      account={account}
      migrationSourceInfo={[MigrationSource.CompoundV2, networkConfig]}
      getMigrateData={async (web3: JsonRpcProvider, [, networkConfig]: MigrationSourceInfo, state: MigratorState) => {
        const compoundNetworkConfig = networkConfig as CompoundNetworkConfig<typeof networkConfig.network>;
        const { migratorEnabled, tokens, cometState } = await sleuth.fetch<
          CompoundV2QueryResponse,
          CTokenMetadataQueryArgs
        >(QUERY, [
          compoundNetworkConfig.comptrollerAddress,
          compoundNetworkConfig.rootsV3.comet,
          compoundNetworkConfig.cTokens.map(ctoken => {
            const symbol = ctoken.underlying.symbol === 'WBTC' ? 'BTC' : ctoken.underlying.symbol;
            return { cToken: ctoken.address, priceOracleSymbol: symbol };
          }),
          account,
          compoundNetworkConfig.migratorAddress
        ]);

        const borrowTokens: MigrateBorrowTokenState[] = tokens.map((cTokenMetadata, index) => {
          const cToken: CToken<typeof networkConfig.network> = compoundNetworkConfig.cTokens[index];
          const maybeTokenState =
            state.type === StateType.Loading
              ? undefined
              : state.data.borrowTokens.find(token => token.address === cToken.address);

          const borrowBalance: bigint = cTokenMetadata.borrowBalance.toBigInt();
          const decimals: number = cToken.decimals;
          const repayAmount: string = maybeTokenState?.repayAmount ?? '';
          const swapRoute: SwapRouteState = maybeTokenState?.swapRoute;
          const price: bigint = cTokenMetadata.price.toBigInt() * 100n; // prices are 1e6, scale to 1e8 to match Comet price precision

          return {
            address: cToken.address,
            borrowBalance,
            decimals,
            name: cToken.name,
            price,
            repayAmount,
            swapRoute,
            symbol: cToken.symbol,
            underlying: cToken.underlying
          };
        });
        const collateralTokens: MigrateCollateralTokenState[] = tokens.map((cTokenMetadata, index) => {
          const cToken = compoundNetworkConfig.cTokens[index];
          const maybeTokenState =
            state.type === StateType.Loading
              ? undefined
              : state.data.collateralTokens.find(token => token.address === cToken.address);

          const balance: bigint = cTokenMetadata.balance.toBigInt();
          const exchangeRate: bigint = cTokenMetadata.exchangeRate.toBigInt();
          const balanceUnderlying: bigint = cTokenMetadata.balanceUnderlying.toBigInt();
          const allowance: bigint = cTokenMetadata.allowance.toBigInt();
          const collateralFactor: bigint = cTokenMetadata.collateralFactor.toBigInt();
          const decimals: number = cToken.decimals;
          const transfer: string = maybeTokenState?.transfer ?? '';
          const price: bigint = cTokenMetadata.price.toBigInt() * 100n; // prices are 1e6, scale to 1e8 to match Comet price precision

          return {
            address: cToken.address,
            allowance,
            balance,
            balanceUnderlying,
            collateralFactor,
            decimals,
            exchangeRate,
            name: cToken.name,
            price,
            symbol: cToken.symbol,
            transfer,
            underlying: cToken.underlying
          };
        });

        return {
          migratorEnabled: migratorEnabled.toBigInt() > 0n,
          borrowTokens,
          collateralTokens,
          cometState: cometQueryResponseToCometData(cometState)
        };
      }}
      selectMigratorSource={selectMigratorSource}
    />
  );
}
