import { useMemo, useEffect } from 'react';
import { RPC, buildRPC } from '@compound-finance/comet-extension';

export function useRPC(): RPC {
  let rpc = useMemo<RPC>(buildRPC, []);

  useEffect(() => {
    rpc.attachHandler()
    return rpc.detachHandler;
  }, [rpc]);

  return rpc;
}
