import { JsonFragment } from '@ethersproject/abi';

import mainnetV3Roots from '../node_modules/comet/deployments/mainnet/usdc/roots.json';
import mainnetV2Roots from '../node_modules/compound-config/networks/mainnet.json';
import mainnetV2Abi from '../node_modules/compound-config/networks/mainnet-abi.json';

import goerliV3Roots from '../node_modules/comet/deployments/goerli/usdc/roots.json';
import goerliV2Roots from '../node_modules/compound-config/networks/goerli.json';
import goerliV2Abi from '../node_modules/compound-config/networks/goerli-abi.json';

import cometMigratorAbi from '../abis/CometMigratorV2';

import ATokens from './helpers/Aave/config';

type ConstTupleItems<Tuple extends readonly [...any]> = Tuple[Exclude<keyof Tuple, keyof Array<any>>];

export const networks = ['goerli', 'mainnet'] as const;
export type Network = ConstTupleItems<typeof networks>;
export const goerli: Network = networks[0];
export const mainnet: Network = networks[1];

const mainnetTokens = [
  'cZRX',
  'cWBTC',
  'cWBTC2',
  'cUSDT',
  'cUSDC',
  'cETH',
  'cREP',
  'cBAT',
  'cCOMP',
  'cLINK',
  'cUNI',
  'cDAI'
] as const;

const mainnetAaveTokens = [
  'aUSDT',
  'aWBTC',
  'aWETH',
  'aYFI',
  'aZRX',
  'aUNI',
  'aAAVE',
  'aBAT',
  'aBUSD',
  'aDAI',
  'aENJ',
  'aKNC',
  'aLINK',
  'aMANA',
  'aMKR',
  'aREN',
  'aSNX',
  'aSUSD',
  'aTUSD',
  'aUSDC',
  'aCRV',
  'aGUSD',
  'aBAL',
  'aXSUSHI',
  'aRENFIL',
  'aRAI',
  'aAMPL',
  'aUSDP',
  'aDPI',
  'aFRAX',
  'aFEI'
] as const;

const goerliTokens = ['cETH', 'cDAI', 'cUSDC', 'cWBTC'] as const;

export type ATokenSym<Network> = Network extends 'mainnet' ? ConstTupleItems<typeof mainnetAaveTokens> : never;

export type CTokenSym<Network> = Network extends 'mainnet'
  ? ConstTupleItems<typeof mainnetTokens>
  : Network extends 'goerli'
  ? ConstTupleItems<typeof goerliTokens>
  : never;

export type RootsV2<Network> = Network extends 'mainnet'
  ? typeof mainnetV2Roots.Contracts
  : Network extends 'goerli'
  ? typeof goerliV2Roots.Contracts
  : never;

export type RootsV3<Network> = Network extends 'mainnet'
  ? typeof mainnetV3Roots
  : Network extends 'goerli'
  ? typeof goerliV3Roots
  : never;

interface CToken<Network> {
  abi: JsonFragment[];
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

export interface NetworkConfig<Network> {
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

export function isNetwork(network: string): network is Network {
  return networks.includes(network as any);
}

export function isMainnet(network: Network): network is 'mainnet' {
  return network === 'mainnet';
}

export function isGoerli(network: Network): network is 'goerli' {
  return network === 'goerli';
}

export function getNetwork(network: string): Network {
  if (isNetwork(network)) {
    return network; // this is now narrowed to `'goerli'|'mainnet'`
  } else {
    throw new Error(`not a network: ${network}`);
  }
}

export function showNetwork(network: Network): string {
  if (network === 'mainnet') {
    return 'mainnet';
  } else if (network === 'goerli') {
    return 'goerli';
  }
  throw 'invalid';
}

export function getIdByNetwork(network: Network): number {
  if (network === 'mainnet') {
    return 1;
  } else if (network === 'goerli') {
    return 5;
  }
  throw 'invalid';
}

export function getNetworkById(chainId: number): Network | null {
  if (chainId === 1) {
    return 'mainnet';
  } else if (chainId === 5) {
    return 'goerli';
  } else {
    return null;
  }
}

function getMigratorAddress(network: Network): string {
  if (network === 'mainnet') {
    return import.meta.env.VITE_MAINNET_EXT_ADDRESS;
  } else if (network === 'goerli') {
    return import.meta.env.VITE_GOERLI_EXT_ADDRESS;
  }

  return null as never;
}

function getComptrollerAddress(network: Network): string {
  if (network === 'mainnet') {
    return '0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B';
  } else if (network === 'goerli') {
    return '0x3cBe63aAcF6A064D32072a630A3eab7545C54d78';
  }

  return null as never;
}

export function mainnetConfig<N extends 'mainnet'>(network: N): NetworkConfig<'mainnet'> {
  const migratorAddress: string = getMigratorAddress(network);
  const comptrollerAddress: string = getComptrollerAddress(network);

  const cTokenSymbols: readonly CTokenSym<'mainnet'>[] = mainnetTokens;

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

export function goerliConfig<N extends 'goerli'>(network: N): NetworkConfig<'goerli'> {
  const migratorAddress: string = getMigratorAddress(network);
  const comptrollerAddress: string = getComptrollerAddress(network);
  const cTokenSymbols: readonly CTokenSym<'goerli'>[] = goerliTokens;

  const rootsV2: RootsV2<'goerli'> = goerliV2Roots.Contracts;
  const migratorAbi = cometMigratorAbi;
  const rootsV3: RootsV3<'goerli'> = goerliV3Roots;
  const cTokens: CToken<'goerli'>[] = cTokenSymbols.map(symbol => {
    const { address, decimals, name } = goerliV2Roots.cTokens[symbol] as {
      address: string;
      decimals: number;
      name: string;
      underlying: string;
    };
    const abi = goerliV2Abi[symbol] as JsonFragment[];

    const underlyingSymbol = symbol.slice(1);
    const underlying =
      symbol === 'cETH'
        ? {
            address: '0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e', // THIS IS WETH ADDRESS
            decimals: 18,
            name: 'Ether',
            symbol: 'ETH'
          }
        : ((goerliV2Roots.Tokens as any)[underlyingSymbol] as {
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

export function getNetworkConfig<N extends Network>(network: N): NetworkConfig<N> {
  if (isMainnet(network)) {
    return mainnetConfig(network) as NetworkConfig<N>;
  } else if (isGoerli(network)) {
    return goerliConfig(network) as NetworkConfig<N>;
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

export function getAaveNetworkConfig<N extends Network>(network: N): AaveNetworkConfig<N> | null {
  if (isMainnet(network)) {
    return aaveMainnetConfig(network) as AaveNetworkConfig<N>;
  }

  return null;
}
