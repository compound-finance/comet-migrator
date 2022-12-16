import '../styles/main.scss';

import { CometState } from '@compound-finance/comet-extension';
import { Contract } from '@ethersproject/contracts';
import { JsonRpcProvider } from '@ethersproject/providers';
import { Contract as MulticallContract, Provider } from 'ethers-multicall';
import { useMemo } from 'react';

import ATokenAbi from '../abis/Aave/AToken';
import AaveDebtToken from '../abis/Aave/DebtToken';
import AaveLendingPool from '../abis/Aave/LendingPool';
import AaveLendingPoolAddressesProvider from '../abis/Aave/LendingPoolAddressesProvider';
import AavePriceOracle from '../abis/Aave/PriceOracle';

import Comet from '../abis/Comet';

import { multicall } from './helpers/multicall';
import { usdPriceFromEthPrice, getLTVAsFactor } from './helpers/numbers';

import Migrator, { MigratorState } from './Migrator';
import { getIdByNetwork } from './Network';
import {
  AaveNetworkConfig,
  AppProps,
  Network,
  MigrationSource,
  MigrationSourceInfo,
  StateType,
  SwapRouteState,
  MigrateBorrowTokenState,
  MigrateCollateralTokenState
} from './types';

type AaveV2MigratorProps<N extends Network> = AppProps & {
  account: string;
  cometState: CometState;
  networkConfig: AaveNetworkConfig<N>;
  selectMigratorSource: (source: MigrationSource) => void;
};

export default function AaveV2Migrator<N extends Network>({
  rpc,
  web3,
  cometState,
  account,
  networkConfig,
  selectMigratorSource
}: AaveV2MigratorProps<N>) {
  const lendingPoolAddressesProvider = useMemo(
    () => new Contract(networkConfig.lendingPoolAddressesProviderAddress, AaveLendingPoolAddressesProvider, web3),
    [web3]
  );
  const oraclePromise = useMemo(async () => {
    const oracleAddress = await lendingPoolAddressesProvider.getPriceOracle();
    return new MulticallContract(oracleAddress, AavePriceOracle);
  }, [lendingPoolAddressesProvider, networkConfig.network]);
  return (
    <Migrator
      rpc={rpc}
      web3={web3}
      cometState={cometState}
      account={account}
      migrationSourceInfo={[MigrationSource.AaveV2, networkConfig]}
      getMigrateData={async (web3: JsonRpcProvider, [, networkConfig]: MigrationSourceInfo, state: MigratorState) => {
        const aaveNetworkConfig = networkConfig as AaveNetworkConfig<typeof networkConfig.network>;
        const ethcallProvider = new Provider(web3, getIdByNetwork(aaveNetworkConfig.network));
        const comet = new MulticallContract(aaveNetworkConfig.rootsV3.comet, Comet);
        const lendingPool = new MulticallContract(aaveNetworkConfig.lendingPoolAddress, AaveLendingPool);
        const oracle = await oraclePromise;

        const aTokenContracts = aaveNetworkConfig.aTokens.map(
          ({ aTokenAddress }) => new MulticallContract(aTokenAddress, ATokenAbi)
        );
        const stableDebtTokenContracts = aaveNetworkConfig.aTokens.map(
          ({ stableDebtTokenAddress }) => new MulticallContract(stableDebtTokenAddress, AaveDebtToken)
        );
        const variableDebtTokenContracts = aaveNetworkConfig.aTokens.map(
          ({ variableDebtTokenAddress }) => new MulticallContract(variableDebtTokenAddress, AaveDebtToken)
        );

        const balanceCalls = aTokenContracts.map(aTokenContract => aTokenContract.balanceOf(account));
        const allowanceCalls = aTokenContracts.map(aTokenContract =>
          aTokenContract.allowance(account, aaveNetworkConfig.migratorAddress)
        );
        const collateralFactorCalls = aaveNetworkConfig.aTokens.map(({ address }) =>
          lendingPool.getConfiguration(address)
        );
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
          comet.allowance(account, aaveNetworkConfig.migratorAddress),
          oracle.getAssetPrice('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'), // HARDCODED MAINNET USDC ADDRESS
          oracle.getAssetsPrices(aaveNetworkConfig.aTokens.map(aToken => aToken.address)),
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
        const borrowBalancesVariableDebtToken = borrowBalanceVariableResponses.map((balance: any) =>
          balance.toBigInt()
        );
        const prices = pricesInEth.map((price: any) =>
          usdPriceFromEthPrice(usdcPriceInEth.toBigInt(), price.toBigInt(), 8)
        );

        const borrowTokens: MigrateBorrowTokenState[] = aaveNetworkConfig.aTokens
          .map((aToken, index) => {
            const maybeStableDebtTokenState =
              state.type === StateType.Loading
                ? undefined
                : state.data.borrowTokens.find(token => token.address === aToken.stableDebtTokenAddress);
            const maybeVariableDebtTokenState =
              state.type === StateType.Loading
                ? undefined
                : state.data.borrowTokens.find(token => token.address === aToken.variableDebtTokenAddress);

            const borrowBalanceStable: bigint = borrowBalancesStableDebtToken[index];
            const borrowBalanceVariable: bigint = borrowBalancesVariableDebtToken[index];
            const decimals: number = aToken.decimals;
            const name: string = aToken.aTokenSymbol;
            const symbol: string = aToken.aTokenSymbol;
            const repayAmountStable: string = maybeStableDebtTokenState?.repayAmount ?? '';
            const repayAmountVariable: string = maybeVariableDebtTokenState?.repayAmount ?? '';
            const swapRouteStable: SwapRouteState = maybeStableDebtTokenState?.swapRoute;
            const swapRouteVariable: SwapRouteState = maybeVariableDebtTokenState?.swapRoute;
            const price: bigint = prices[index];
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
        const collateralTokens: MigrateCollateralTokenState[] = aaveNetworkConfig.aTokens.map((aToken, index) => {
          const maybeTokenState =
            state.type === StateType.Loading
              ? undefined
              : state.data.collateralTokens.find(token => token.address === aToken.aTokenAddress);

          const balance: bigint = balances[index];
          const balanceUnderlying = balance;
          const allowance: bigint = allowances[index];
          const collateralFactor: bigint = collateralFactors[index];
          const transfer: string = maybeTokenState?.transfer ?? '';
          const price: bigint = prices[index];
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
          migratorEnabled,
          borrowTokens,
          collateralTokens
        };
      }}
      selectMigratorSource={selectMigratorSource}
    />
  );
}
