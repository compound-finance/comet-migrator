import { JsonFragment } from '@ethersproject/abi';

import mainnetV3Roots from '../node_modules/comet/deployments/mainnet/usdc/roots.json';
import mainnetV2Roots from '../node_modules/compound-config/networks/mainnet.json';
import mainnetV2Abi from '../node_modules/compound-config/networks/mainnet-abi.json';

import cometMigratorAbi from '../abis/CometMigratorV2';

import ATokens from './helpers/Aave/config';
import { mainnetCompoundTokens } from './helpers/utils';

import {
  AaveNetworkConfig,
  AToken,
  CompoundNetworkConfig,
  CTokenSym,
  CToken,
  Network,
  networks,
  RootsV2,
  RootsV3,
  Token
} from './types';

export function isNetwork(network: string): network is Network {
  return networks.includes(network as any);
}

export function isMainnet(network: Network): network is 'mainnet' {
  return network === 'mainnet';
}

export function getNetwork(network: string): Network {
  if (isNetwork(network)) {
    return network; // this is now narrowed to `'mainnet'`
  } else {
    throw new Error(`not a supported network: ${network}`);
  }
}

export function showNetwork(network: Network): string {
  if (network === 'mainnet') {
    return 'mainnet';
  }
  throw 'invalid';
}

export function getIdByNetwork(network: Network): number {
  if (network === 'mainnet') {
    return 1;
  }
  throw 'invalid';
}

export function getNativeTokenByNetwork(network: Network): Token {
  if (network === 'mainnet') {
    return {
      decimals: 18,
      name: 'Ether',
      symbol: 'ETH'
    };
  }
  throw 'invalid';
}

export function getNetworkById(chainId: number): Network | null {
  if (chainId === 1) {
    return 'mainnet';
  } else {
    return null;
  }
}

function getMigratorAddress(network: Network): string {
  if (network === 'mainnet') {
    return import.meta.env.VITE_MAINNET_EXT_ADDRESS;
  }

  return null as never;
}

export function compoundMainnetConfig<N extends 'mainnet'>(network: N): CompoundNetworkConfig<'mainnet'> {
  const migratorAddress: string = getMigratorAddress(network);
  const comptrollerAddress: string = '0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B';

  const cTokenSymbols: readonly CTokenSym<'mainnet'>[] = mainnetCompoundTokens;

  const rootsV2: RootsV2<'mainnet'> = mainnetV2Roots.Contracts;
  const migratorAbi = cometMigratorAbi;
  const rootsV3: RootsV3<'mainnet'> = mainnetV3Roots;
  const cTokens: CToken<'mainnet'>[] = cTokenSymbols.map(symbol => {
    const { address, decimals, name } = mainnetV2Roots.cTokens[symbol] as {
      address: string;
      decimals: number;
      name: string;
      underlying: string;
    };
    const abi = mainnetV2Abi[symbol] as JsonFragment[];

    const underlyingSymbol = symbol === 'cWBTC2' ? 'WBTC' : symbol.slice(1);
    const underlying =
      symbol === 'cETH'
        ? {
            address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // THIS IS WETH ADDRESS
            decimals: 18,
            name: 'Ether',
            symbol: 'ETH'
          }
        : ((mainnetV2Roots.Tokens as any)[underlyingSymbol] as {
            address: string;
            decimals: number;
            name: string;
            symbol: string;
          });

    return {
      abi,
      address,
      decimals,
      name,
      symbol,
      underlying
    };
  });

  return {
    network,
    comptrollerAddress,
    migratorAddress,
    migratorAbi,
    cTokens,
    rootsV2,
    rootsV3
  };
}

export function getCompoundNetworkConfig<N extends Network>(network: N): CompoundNetworkConfig<N> {
  if (isMainnet(network)) {
    return compoundMainnetConfig(network) as CompoundNetworkConfig<N>;
  }
  return null as never;
}

export function aaveMainnetConfig<N extends 'mainnet'>(network: N): AaveNetworkConfig<'mainnet'> {
  const migratorAbi = cometMigratorAbi;
  const migratorAddress: string = getMigratorAddress(network);
  const lendingPoolAddressesProviderAddress = '0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5';
  const lendingPoolAddress = '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9';
  const rootsV3: RootsV3<'mainnet'> = mainnetV3Roots;

  return {
    aTokens: ATokens as AToken[],
    lendingPoolAddressesProviderAddress,
    lendingPoolAddress,
    migratorAbi,
    migratorAddress,
    network,
    rootsV3
  };
}

export function getAaveNetworkConfig<N extends Network>(network: N): AaveNetworkConfig<N> {
  if (isMainnet(network)) {
    return aaveMainnetConfig(network) as AaveNetworkConfig<N>;
  }

  return null as never;
}
