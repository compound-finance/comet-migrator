import '../styles/main.scss';

import { useCallback, useEffect, useState } from 'react';

import { LoadingView } from './components/LoadingViews';

import { getDocument } from './helpers/utils';

import { useAsyncEffect } from './lib/useAsyncEffect';
import { usePoll } from './lib/usePoll';

import AaveV2Migrator from './AaveV2Migrator';
import CompoundV2Migrator from './CompoundV2Migrator';
import { getNetworkById, getCompoundNetworkConfig, getAaveNetworkConfig } from './Network';
import { AaveNetworkConfig, AppProps, CompoundNetworkConfig, Network, MigrationSource } from './types';

export default ({ rpc, web3 }: AppProps) => {
  const [account, setAccount] = useState<string | null>(null);
  const timer = usePoll(!!account ? 30000 : 3000);
  const [migrationSource, setMigrationSource] = useState<MigrationSource>(MigrationSource.CompoundV2);
  const [compoundNetworkConfig, setCompoundNetworkConfig] = useState<CompoundNetworkConfig<Network> | null>(null);
  const [aaveNetworkConfig, setAaveNetworkConfig] = useState<AaveNetworkConfig<Network> | null>(null);

  useEffect(() => {
    if (rpc) {
      rpc.on({
        setTheme: ({ theme }) => {
          getDocument(document => {
            document.body.classList.add('theme');
            document.body.classList.remove(`theme--dark`);
            document.body.classList.remove(`theme--light`);
            document.body.classList.add(`theme--${theme.toLowerCase()}`);
          });
        },
      });
    }
  }, [rpc]);

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
      setCompoundNetworkConfig(getCompoundNetworkConfig(network));
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
