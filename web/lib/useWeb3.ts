import { useMemo } from 'react';
import { sendWeb3 } from './RPC';
import { SendRPC } from './useRPC';
import { JsonRpcProvider } from '@ethersproject/providers';

class RpcWeb3Provider extends JsonRpcProvider {
  sendRPC: SendRPC;

  constructor(sendRPC: SendRPC) {
    super();
    this.sendRPC = sendRPC;
  }

  send(method: string, params: Array<any>): Promise<any> {
    let res = sendWeb3(this.sendRPC, method, params);
    res.then((r) => console.log("rpc response", method, params, r));
    return res;
  }
}

export function useWeb3(sendRPC: SendRPC) {
  return useMemo(() => new RpcWeb3Provider(sendRPC), []);
}
