import { JsonRpcProvider, TransactionReceipt, TransactionResponse } from '@ethersproject/providers';
import { useState } from 'react';

import { Tracker, Transaction, TransactionState } from '../types';

export function hasAwaitingConfirmationTransaction(tracker: Tracker, key: string): boolean {
  const maybeTrx = tracker.get(key);
  return !!maybeTrx && maybeTrx.state == TransactionState.AwaitingConfirmation;
}

export function hasPendingTransaction(tracker: Tracker, key?: string): boolean {
  if (key === undefined) {
    return [...tracker.entries()].some(([_hash, trx]) => trx?.state === TransactionState.Pending);
  }

  const maybeTrx = tracker.get(key);

  return !!maybeTrx && maybeTrx.state == TransactionState.Pending;
}

export function useTransactionTracker(web3: JsonRpcProvider) {
  const [tracker, setTracker] = useState<Tracker>(new Map());

  function setTxStatus(key: string, txHash: string | null, txReceipt: null | TransactionReceipt) {
    let nextTracker = new Map(tracker);
    const transaction: Transaction =
      txHash === null
        ? {
            key,
            state: TransactionState.AwaitingConfirmation
          }
        : txReceipt === null
        ? {
            key,
            hash: txHash,
            state: TransactionState.Pending
          }
        : {
            key,
            hash: txHash,
            receipt: txReceipt,
            state: txReceipt.status === 1 ? TransactionState.Success : TransactionState.Reverted
          };
    nextTracker.set(key, transaction);
    setTracker(nextTracker);
  }

  function deleteKeyFromTracker(key: string) {
    let nextTracker = new Map(tracker);
    nextTracker.delete(key);
    setTracker(nextTracker);
  }

  function trackTransaction(
    key: string,
    responsePromise: Promise<TransactionResponse>,
    callback?: () => void
  ): Promise<TransactionResponse> {
    setTxStatus(key, null, null);
    responsePromise
      .then(response => {
        let txHash = response.hash;
        if (txHash) {
          setTxStatus(key, txHash, null);
          web3.waitForTransaction(txHash).then((receipt: TransactionReceipt) => {
            setTxStatus(key, txHash, receipt);
            callback?.();
          });
        }
      })
      .catch(_e => {
        console.log('ERROR RECEIPT-----', _e);
        deleteKeyFromTracker(key);
      });

    return responsePromise;
  }

  return { tracker, trackTransaction };
}
