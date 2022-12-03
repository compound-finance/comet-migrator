import '../styles/main.scss';

import { useCallback, useState } from 'react';

import { LoadingView } from './components/LoadingViews';

import { useAsyncEffect } from './lib/useAsyncEffect';
import { usePoll } from './lib/usePoll';

import AaveV2Migrator from './AaveV2Migrator';
import CompoundV2Migrator from './CompoundV2Migrator';
import {
  Network,
  NetworkConfig,
  getNetworkById,
  getNetworkConfig,
  AaveNetworkConfig,
  getAaveNetworkConfig
} from './Network';
import { AppProps, MigrationSource } from './types';

export default ({ rpc, web3 }: AppProps) => {
  const [account, setAccount] = useState<string | null>(null);
  const timer = usePoll(!!account ? 30000 : 3000);
  const [migrationSource, setMigrationSource] = useState<MigrationSource>(MigrationSource.CompoundV2);
  const [compoundNetworkConfig, setCompoundNetworkConfig] = useState<NetworkConfig<Network> | null>(null);
  const [aaveNetworkConfig, setAaveNetworkConfig] = useState<AaveNetworkConfig<Network> | null>(null);

  const selectMigratorSource = useCallback(
    (source: MigrationSource) => {
      if (source !== migrationSource) {
        setMigrationSource(source);
      }
    },
    [migrationSource, setMigrationSource]
  );

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
      setCompoundNetworkConfig(getNetworkConfig(network));
      setAaveNetworkConfig(getAaveNetworkConfig(network));
    } else {
      setCompoundNetworkConfig(null);
    }
  }, [web3, timer]);

  if (migrationSource === MigrationSource.CompoundV2 && compoundNetworkConfig !== null && account) {
    return (
      <CompoundV2Migrator
        rpc={rpc}
        web3={web3}
        account={account}
        networkConfig={compoundNetworkConfig}
        selectMigratorSource={selectMigratorSource}
      />
    );
  } else if (migrationSource === MigrationSource.AaveV2 && aaveNetworkConfig !== null && account) {
    return (
      <AaveV2Migrator
        rpc={rpc}
        web3={web3}
        account={account}
        networkConfig={aaveNetworkConfig}
        selectMigratorSource={selectMigratorSource}
      />
    );
  } else {
    return <LoadingView rpc={rpc} migrationSource={migrationSource} selectMigratorSource={selectMigratorSource} />;
  }
};
