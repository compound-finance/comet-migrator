import { MigrationSource } from '../types';

export function getDocument(f: (document: Document) => void) {
  if (document.readyState !== 'loading') {
    f(document);
  } else {
    window.addEventListener('DOMContentLoaded', _event => {
      f(document);
    });
  }
}

export function migratorTrxKey(migratorAddress: string): string {
  return `migrate_${migratorAddress}`;
}

export function tokenApproveTrxKey(tokenAddress: string, approveAddress: string): string {
  return `approve_${tokenAddress}_${approveAddress}`;
}

export function migrationSourceToDisplayString(migrationSource: MigrationSource): string {
  switch (migrationSource) {
    case MigrationSource.AaveV2:
      return 'Aave V2';
    case MigrationSource.CompoundV2:
      return 'Compound V2';
  }
}

export const EMPTY_MIGRATOR_POSITION = {
  collateral: [],
  borrows: [],
  swaps: []
};
