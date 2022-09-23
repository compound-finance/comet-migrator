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
    if (cache && method in this._cache) {
      return this._cache[method];
    }
    let res = sendWeb3(this.sendRPC, method, params);
    res.then((r) => console.log(method, r));
    if (cache) {
      this._cache[method] = res;
      setTimeout(() => {
        delete this._cache[method];
      }, 0);
    }
    return res;
  }
}

export function useWeb3(sendRPC: SendRPC) {
  return useMemo(() => new RpcWeb3Provider(sendRPC), []);
}
