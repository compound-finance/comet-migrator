import { useMemo } from 'react';
import { SendRPC, RPCWeb3Provider } from '@compound-finance/comet-extension';

export function useWeb3(sendRPC: SendRPC) {
  return useMemo(() => new RPCWeb3Provider(sendRPC), []);
}
