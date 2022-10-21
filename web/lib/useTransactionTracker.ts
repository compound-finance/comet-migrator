import type { TransactionReceipt, TransactionResponse } from '@ethersproject/providers';
import { useMemo, useState, useEffect } from 'react';
import { JsonRpcProvider } from '@ethersproject/providers';

export type Tracker = Map<string, null | TransactionReceipt>;

export function hasPendingTransaction(tracker: Tracker): boolean {
  return [...tracker.entries()].some(([hash, status]) => status === null);
}

export function useTransactionTracker(web3: JsonRpcProvider) {
  let [tracker, setTracker] = useState<Tracker>(new Map());

  function setTxStatus(txHash: string, txStatus: null | TransactionReceipt) {
    let nextTracker = new Map(tracker);
    nextTracker.set(txHash, txStatus);
    setTracker(nextTracker);
  }

  function trackTransaction(responsePromise: Promise<TransactionResponse>): Promise<TransactionResponse> {
    responsePromise.then((response) => {
      let txHash = response.hash;
      if (txHash) {
        setTxStatus(txHash, null);
        web3.waitForTransaction(txHash).then((receipt: TransactionReceipt) => {
          setTxStatus(txHash, receipt);
        });
      }
    });

    return responsePromise;
  }

  return { tracker, trackTransaction };
}
