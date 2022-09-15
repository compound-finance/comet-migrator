import { useMemo } from 'react';
import { sendWeb3 } from './RPC';
import { SendRPC } from './useRPC';
import { JsonRpcProvider } from '@ethersproject/providers';

class RpcWeb3Provider extends JsonRpcProvider  {
  sendRPC: SendRPC;

  constructor(sendRPC: SendRPC) {
    super(undefined, "any");
    this.sendRPC = sendRPC;
  }

  send(method: string, params: Array<any>): Promise<any> {
    const cache = ["eth_chainId", "eth_blockNumber"].indexOf(method) >= 0;
    if (cache && this._cache[method]) {
      return this._cache[method];
    }
    let res = sendWeb3(this.sendRPC, method, params);
    res.then((r) => console.log(method, r));
    if (cache) {
      this._cache[method] = res;
      setTimeout(() => {
        this._cache[method] = null as any;
      }, 0);
    }
    return res;
  }
}

export function useWeb3(sendRPC: SendRPC) {
  return useMemo(() => new RpcWeb3Provider(sendRPC), []);
}
