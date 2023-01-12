import '../styles/main.scss';

import { Sleuth } from '@compound-finance/sleuth';
import { JsonRpcProvider } from '@ethersproject/providers';
import { BigNumber } from 'ethers';
import { useMemo } from 'react';

import { usdPriceFromEthPrice, getLTVAsFactor } from './helpers/numbers';
import AaveV2Query from './helpers/Sleuth/out/AaveV2Query.sol/AaveV2Query.json';
import { cometQueryResponseToCometData } from './helpers/utils';

import Migrator, { MigratorState } from './Migrator';
import { getNativeTokenByNetwork } from './Network';
import {
  AaveNetworkConfig,
  AppProps,
  CometQueryResponse,
  Network,
  MigrationSource,
  MigrationSourceInfo,
  StateType,
  SwapRouteState,
  MigrateBorrowTokenState,
  MigrateCollateralTokenState,
  AToken
} from './types';

const QUERY = Sleuth.querySol(AaveV2Query, { queryFunctionName: 'getMigratorData' });

type AaveV2MigratorProps<N extends Network> = AppProps & {
  account: string;
  networkConfig: AaveNetworkConfig<N>;
  selectMigratorSource: (source: MigrationSource) => void;
};

type ATokenRequest = {
  aToken: string;
  stableDebtToken: string;
  underlying: string;
  variableDebtToken: string;
};

type ATokenMetadataQueryArgs = [string, string, string, ATokenRequest[], string, string, string];
type ATokenMetadata = {
  aToken: string;
  stableDebtToken: string;
  variableDebtToken: string;
  allowance: BigNumber;
  balance: BigNumber;
  stableDebtBalance: BigNumber;
  variableDebtBalance: BigNumber;
  configuration: BigNumber;
  priceInETH: BigNumber;
};
type AaveV2QueryResponse = {
  migratorEnabled: BigNumber;
  tokens: ATokenMetadata[];
  cometState: CometQueryResponse;
  usdcPriceInETH: BigNumber;
};

export default function AaveV2Migrator<N extends Network>({
  rpc,
  web3,
  account,
  networkConfig,
  selectMigratorSource
}: AaveV2MigratorProps<N>) {
  const sleuth = useMemo(() => new Sleuth(web3), [web3]);

  return (
    <Migrator
      rpc={rpc}
      web3={web3}
      account={account}
      migrationSourceInfo={[MigrationSource.AaveV2, networkConfig]}
      getMigrateData={async (web3: JsonRpcProvider, [, networkConfig]: MigrationSourceInfo, state: MigratorState) => {
        const aaveNetworkConfig = networkConfig as AaveNetworkConfig<typeof networkConfig.network>;
        const { migratorEnabled, tokens, cometState, usdcPriceInETH } = await sleuth.fetch<
          AaveV2QueryResponse,
          ATokenMetadataQueryArgs
        >(QUERY, [
          aaveNetworkConfig.lendingPoolAddressesProviderAddress,
          aaveNetworkConfig.lendingPoolAddress,
          aaveNetworkConfig.rootsV3.comet,
          aaveNetworkConfig.aTokens.map(atoken => {
            return {
              aToken: atoken.aTokenAddress,
              stableDebtToken: atoken.stableDebtTokenAddress,
              underlying: atoken.address,
              variableDebtToken: atoken.variableDebtTokenAddress
            };
          }),
          account,
          aaveNetworkConfig.migratorAddress,
          '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
        ]);

        const borrowTokens: MigrateBorrowTokenState[] = tokens
          .map((aTokenMetadata, index) => {
            const aToken: AToken = aaveNetworkConfig.aTokens[index];
            const maybeStableDebtTokenState =
              state.type === StateType.Loading
                ? undefined
                : state.data.borrowTokens.find(token => token.address === aToken.stableDebtTokenAddress);
            const maybeVariableDebtTokenState =
              state.type === StateType.Loading
                ? undefined
                : state.data.borrowTokens.find(token => token.address === aToken.variableDebtTokenAddress);

            const borrowBalanceStable: bigint = aTokenMetadata.stableDebtBalance.toBigInt();
            const borrowBalanceVariable: bigint = aTokenMetadata.variableDebtBalance.toBigInt();
            const decimals: number = aToken.decimals;
            const name: string = aToken.aTokenSymbol;
            const symbol: string = aToken.aTokenSymbol;
            const repayAmountStable: string = maybeStableDebtTokenState?.repayAmount ?? '';
            const repayAmountVariable: string = maybeVariableDebtTokenState?.repayAmount ?? '';
            const swapRouteStable: SwapRouteState = maybeStableDebtTokenState?.swapRoute;
            const swapRouteVariable: SwapRouteState = maybeVariableDebtTokenState?.swapRoute;
            const price: bigint = usdPriceFromEthPrice(
              usdcPriceInETH.toBigInt(),
              aTokenMetadata.priceInETH.toBigInt(),
              8
            );
            const underlying = {
              address: aToken.address,
              decimals: aToken.decimals,
              name: aToken.symbol,
              symbol: aToken.symbol
            };

            const stableDebtTokenState: MigrateBorrowTokenState = {
              address: aToken.stableDebtTokenAddress,
              borrowBalance: borrowBalanceStable,
              borrowType: 'stable',
              decimals,
              name,
              price,
              repayAmount: repayAmountStable,
              swapRoute: swapRouteStable,
              symbol,
              underlying
            };
            const variableDebtTokenState: MigrateBorrowTokenState = {
              address: aToken.variableDebtTokenAddress,
              borrowBalance: borrowBalanceVariable,
              borrowType: 'variable',
              decimals,
              name,
              price,
              repayAmount: repayAmountVariable,
              swapRoute: swapRouteVariable,
              symbol,
              underlying
            };
            return [stableDebtTokenState, variableDebtTokenState];
          })
          .flat();
        const collateralTokens: MigrateCollateralTokenState[] = tokens.map((aTokenMetadata, index) => {
          const aToken: AToken = aaveNetworkConfig.aTokens[index];
          const maybeTokenState =
            state.type === StateType.Loading
              ? undefined
              : state.data.collateralTokens.find(token => token.address === aToken.aTokenAddress);

          const balance: bigint = aTokenMetadata.balance.toBigInt();
          const balanceUnderlying = balance;
          const allowance: bigint = aTokenMetadata.allowance.toBigInt();
          const collateralFactor: bigint = getLTVAsFactor(aTokenMetadata.configuration.toBigInt());
          const transfer: string = maybeTokenState?.transfer ?? '';
          const price: bigint = usdPriceFromEthPrice(
            usdcPriceInETH.toBigInt(),
            aTokenMetadata.priceInETH.toBigInt(),
            8
          );
          const decimals: number = aToken.decimals;
          const name: string = aToken.aTokenSymbol;
          const symbol: string = aToken.aTokenSymbol;
          const underlying = {
            address: aToken.address,
            decimals: aToken.decimals,
            name: aToken.symbol,
            symbol: aToken.symbol
          };

          return {
            address: aToken.aTokenAddress,
            allowance,
            balance,
            balanceUnderlying,
            collateralFactor,
            decimals,
            name,
            price,
            symbol,
            transfer,
            underlying
          };
        });

        return {
          migratorEnabled: migratorEnabled.toBigInt() > 0n,
          borrowTokens,
          collateralTokens,
          cometState: cometQueryResponseToCometData(cometState, getNativeTokenByNetwork(aaveNetworkConfig.network))
        };
      }}
      selectMigratorSource={selectMigratorSource}
    />
  );
}
