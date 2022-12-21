import '../styles/main.scss';

import { CometState } from '@compound-finance/comet-extension';
import { Sleuth } from '@compound-finance/sleuth';
import { Contract } from '@ethersproject/contracts';
import { JsonRpcProvider } from '@ethersproject/providers';
import { Contract as MulticallContract, Provider } from 'ethers-multicall';
import { useMemo } from 'react';

import Comet from '../abis/Comet';
import Comptroller from '../abis/Comptroller';
import CToken from '../abis/CToken';
import CompoundV2Oracle from '../abis/Oracle';

import CompoundV2Query from './helpers/Sleuth/out/CompoundV2Query.sol/CompoundV2Query.json';
import { multicall } from './helpers/multicall';

import Migrator, { MigratorState } from './Migrator';
import { getIdByNetwork } from './Network';
import {
  AppProps,
  CompoundNetworkConfig,
  MigrateBorrowTokenState,
  MigrateCollateralTokenState,
  MigrationSource,
  MigrationSourceInfo,
  Network,
  StateType,
  SwapRouteState
} from './types';

const QUERY = Sleuth.querySol(CompoundV2Query);

type CompoundV2MigratorProps<N extends Network> = AppProps & {
  account: string;
  cometState: CometState;
  networkConfig: CompoundNetworkConfig<N>;
  selectMigratorSource: (source: MigrationSource) => void;
};

export default function CompoundV2Migrator<N extends Network>({
  rpc,
  web3,
  account,
  cometState,
  networkConfig,
  selectMigratorSource
}: CompoundV2MigratorProps<N>) {
  const comptroller = useMemo(() => new Contract(networkConfig.comptrollerAddress, Comptroller, web3), [
    web3,
    networkConfig.network
  ]);
  const oraclePromise = useMemo(async () => {
    const oracleAddress = await comptroller.oracle();
    return new MulticallContract(oracleAddress, CompoundV2Oracle);
  }, [comptroller]);

  const sleuth = useMemo(() => new Sleuth(web3), [web3]);

  return (
    <Migrator
      rpc={rpc}
      web3={web3}
      cometState={cometState}
      account={account}
      migrationSourceInfo={[MigrationSource.CompoundV2, networkConfig]}
      getMigrateData={async (web3: JsonRpcProvider, [, networkConfig]: MigrationSourceInfo, state: MigratorState) => {
        const compoundNetworkConfig = networkConfig as CompoundNetworkConfig<typeof networkConfig.network>;
        const response = await sleuth.fetch(QUERY, [
          compoundNetworkConfig.comptrollerAddress,
          compoundNetworkConfig.cTokens.map(ctoken => ctoken.address),
          account,
          compoundNetworkConfig.migratorAddress
        ]);
        console.log('SLEUTHING....', response);
        
        const ethcallProvider = new Provider(web3, getIdByNetwork(compoundNetworkConfig.network));
        const comet = new MulticallContract(compoundNetworkConfig.rootsV3.comet, Comet);
        const comptroller = new MulticallContract(compoundNetworkConfig.comptrollerAddress, Comptroller);
        const cTokenContracts = compoundNetworkConfig.cTokens.map(
          ({ address }) => new MulticallContract(address, CToken)
        );
        const oracle = await oraclePromise;

        const balanceCalls = cTokenContracts.map(cTokenContract => cTokenContract.balanceOf(account));
        const borrowBalanceCalls = cTokenContracts.map(cTokenContract => cTokenContract.borrowBalanceCurrent(account));
        const exchangeRateCalls = cTokenContracts.map(cTokenContract => cTokenContract.exchangeRateCurrent());
        const allowanceCalls = cTokenContracts.map(cTokenContract =>
          cTokenContract.allowance(account, compoundNetworkConfig.migratorAddress)
        );
        const collateralFactorCalls = cTokenContracts.map(cTokenContract =>
          comptroller.markets(cTokenContract.address)
        );
        const priceCalls = compoundNetworkConfig.cTokens.map(cToken => {
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
          comet.allowance(account, compoundNetworkConfig.migratorAddress),
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
        const collateralFactors = collateralFactorResponses.map(([, collateralFactor]: any) =>
          collateralFactor.toBigInt()
        );
        const prices = priceResponses.map((price: any) => price.toBigInt() * 100n); // Scale up to match V3 price precision of 1e8

        const borrowTokens: MigrateBorrowTokenState[] = compoundNetworkConfig.cTokens.map((cToken, index) => {
          const maybeTokenState =
            state.type === StateType.Loading
              ? undefined
              : state.data.borrowTokens.find(token => token.address === cToken.address);

          const borrowBalance: bigint = borrowBalances[index];
          const decimals: number = cToken.decimals;
          const repayAmount: string = maybeTokenState?.repayAmount ?? '';
          const swapRoute: SwapRouteState = maybeTokenState?.swapRoute;
          const price: bigint = prices[index];

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
        const collateralTokens: MigrateCollateralTokenState[] = compoundNetworkConfig.cTokens.map((cToken, index) => {
          const maybeTokenState =
            state.type === StateType.Loading
              ? undefined
              : state.data.collateralTokens.find(token => token.address === cToken.address);

          const balance: bigint = balances[index];
          const exchangeRate: bigint = exchangeRates[index];
          const balanceUnderlying: bigint = (balance * exchangeRate) / 1000000000000000000n;
          const allowance: bigint = allowances[index];
          const collateralFactor: bigint = collateralFactors[index];
          const decimals: number = cToken.decimals;
          const transfer: string = maybeTokenState?.transfer ?? '';
          const price: bigint = prices[index];

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
          migratorEnabled,
          borrowTokens,
          collateralTokens
        };
      }}
      selectMigratorSource={selectMigratorSource}
    />
  );
}
