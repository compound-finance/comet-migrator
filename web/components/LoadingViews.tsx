import { RPC } from '@compound-finance/comet-extension';
import { useEffect } from 'react';

import { getDocument, migrationSourceToDisplayString } from '../helpers/utils';

import { MigrationSource } from '../types';

import Dropdown from './Dropdown';

export const LoadingAsset = () => {
  return (
    <div className="migrator__input-view">
      <div className="migrator__input-view__content">
        <div className="migrator__input-view__left">
          <div className="migrator__input-view__header">
            <span className="placeholder-content" style={{ width: '25%' }}></span>
          </div>
          <h4 className="heading" style={{ marginTop: '1rem' }}>
            <span className="placeholder-content" style={{ width: '40%' }}></span>
          </h4>
          <p className="meta text-color--2" style={{ marginTop: '0.25rem' }}>
            <span className="placeholder-content" style={{ width: '20%' }}></span>
          </p>
        </div>
        <div className="migrator__input-view__right">
          <button className="button button--small" disabled style={{ width: '3rem' }}>
            <span className="placeholder-content" style={{ width: '100%' }}></span>
          </button>
          <p className="meta text-color--2" style={{ marginTop: '0.75rem', width: '7rem' }}>
            <span className="placeholder-content" style={{ width: '100%' }}></span>
          </p>
          <p className="meta text-color--2" style={{ width: '5rem' }}>
            <span className="placeholder-content" style={{ width: '100%' }}></span>
          </p>
        </div>
      </div>
    </div>
  );
};

export const LoadingPosition = () => {
  return (
    <div className={`migrator__summary__section`}>
      <label className="L1 label text-color--2 migrator__summary__section__header" style={{ width: '6rem' }}>
        <span className="placeholder-content" style={{ width: '100%' }}></span>
      </label>
      <div className="migrator__summary__section__row">
        <div>
          <p className="meta text-color--2">
            <span className="placeholder-content" style={{ width: '20%' }}></span>
          </p>
          <h4 className="heading heading--emphasized">
            <span className="placeholder-content" style={{ width: '35%' }}></span>
          </h4>
        </div>
      </div>
      <div className="migrator__summary__section__row">
        <div>
          <p className="meta text-color--2">
            <span className="placeholder-content" style={{ width: '27%' }}></span>
          </p>
          <p className="body body--emphasized">
            <span className="placeholder-content" style={{ width: '45%' }}></span>
          </p>
        </div>
        <div>
          <p className="meta text-color--2">
            <span className="placeholder-content" style={{ width: '30%' }}></span>
          </p>
          <p className="body body--emphasized">
            <span className="placeholder-content" style={{ width: '60%' }}></span>
          </p>
        </div>
      </div>
      <div className="migrator__summary__section__row">
        <div>
          <p className="meta text-color--2">
            <span className="placeholder-content" style={{ width: '33%' }}></span>
          </p>
          <p className="body body--emphasized">
            <span className="placeholder-content" style={{ width: '55%' }}></span>
          </p>
        </div>
        <div>
          <p className="meta text-color--2">
            <span className="placeholder-content" style={{ width: '22%' }}></span>
          </p>
          <p className="body body--emphasized">
            <span className="placeholder-content" style={{ width: '50%' }}></span>
          </p>
        </div>
      </div>
      <div className="migrator__summary__section__row">
        <div>
          <p className="meta text-color--2">
            <span className="placeholder-content" style={{ width: '25%' }}></span>
          </p>
          <p className="body body--emphasized">
            <span className="placeholder-content" style={{ width: '55%' }}></span>
          </p>
        </div>
      </div>
      <div className="meter">
        <div className="meter__bar"></div>
      </div>
    </div>
  );
};

export const LoadingView = ({
  rpc,
  migrationSource,
  selectMigratorSource
}: {
  rpc?: RPC;
  migrationSource: MigrationSource;
  selectMigratorSource: (source: MigrationSource) => void;
}) => {
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
        }
      });
    }
  }, [rpc]);

  return (
    <div className="page migrator">
      <div className="container">
        <div className="migrator__content">
          <div className="migrator__balances">
            <div className="panel L4">
              <div className="panel__header-row">
                <h1 className="heading heading--emphasized">Balances</h1>
              </div>
              <p className="body">
                Select a source and the balances you want to migrate to Compound V3. If you are supplying USDC on one
                market while borrowing on the other, your ending balance will be the net of these two balances.
              </p>

              <div className="migrator__balances__section">
                <label className="L1 label text-color--2 migrator__balances__section__header">Source</label>
                <Dropdown
                  options={Object.values(MigrationSource).map(source => [
                    source,
                    migrationSourceToDisplayString(source)
                  ])}
                  selectedOption={migrationSourceToDisplayString(migrationSource)}
                  selectOption={(option: [string, string]) => {
                    selectMigratorSource(option[0] as MigrationSource);
                  }}
                />
              </div>

              <div className="migrator__balances__section">
                <label className="L1 label text-color--2 migrator__balances__section__header">Borrowing</label>
                <LoadingAsset />
              </div>
              <div className="migrator__balances__section">
                <label className="L1 label text-color--2 migrator__balances__section__header">Supplying</label>
                <LoadingAsset />
                <LoadingAsset />
                <LoadingAsset />
              </div>
            </div>
          </div>
          <div className="migrator__summary">
            <div className="panel L4">
              <div className="panel__header-row">
                <h1 className="heading heading--emphasized">Summary</h1>
              </div>
              <p className="body">
                If you are borrowing other assets on V2, migrating too much collateral could increase your liquidation
                risk.
              </p>
              <LoadingPosition />
              <LoadingPosition />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
