import type { TransactionReceipt, TransactionResponse } from '@ethersproject/providers';
import { useMemo, useState, useEffect } from 'react';
import { JsonRpcProvider } from '@ethersproject/providers';

export type Status = Map<string, null | TransactionReceipt>;

export function useTransactionTracker(web3: JsonRpcProvider) {
  let [tracker, setStatus] = useState<Status>(new Map());

  function setTxStatus(txHash: string, txStatus: null | TransactionReceipt) {
    let nextTracker = new Map(tracker);
    nextTracker.set(txHash, txStatus);
    setStatus(nextTracker);
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
