import '../styles/main.scss';
import { SendRPC } from './lib/useRPC';
import { read, write } from './lib/RPC';
import { useEffect, useMemo, useState } from 'react';
import ERC20 from '../abis/ERC20';
import Comet from '../abis/Comet';
import { CTokenSym, Network, NetworkConfig, getNetwork, getNetworkById, getNetworkConfig, isNetwork } from './Network';
import { JsonRpcProvider } from '@ethersproject/providers';
import { Contract, ContractInterface } from '@ethersproject/contracts';

const MAX_UINT256 = BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935');

interface AppProps {
  sendRPC?: SendRPC
  web3: JsonRpcProvider
}

type AppPropsExt<Network> = AppProps & {
  account: string,
  networkConfig: NetworkConfig<Network>
};

interface AccountState<Network> {
  migratorEnabled: boolean,
  borrowBalanceV2?: bigint
  cTokens: Map<CTokenSym<Network>, CTokenState>
}

interface CTokenState {
  balance?: bigint,
  allowance?: bigint,
  transfer: number | 'max',
  decimals?: bigint,
}

function showAmount(amount: bigint | undefined, decimals: bigint | undefined): string {
  if (amount && decimals) {
    return (Number(amount) / Number(10n ** decimals)).toFixed(4);
  } else {
    return '';
  }
}

function usePoll(timeout: number) {
  const [timer, setTimer] = useState(0);

  useEffect(() => {
    let t: NodeJS.Timer;
    function loop(x: number, delay: number) {
      t = setTimeout(() => {
        requestAnimationFrame(() => {
          setTimer(x);
          loop(x + 1, delay);
        });
      }, delay);
    }
    loop(1, timeout);
    return () => clearTimeout(t)
  }, []);

  return timer;
}

function useAsyncEffect(fn: () => Promise<void>, deps: any[] = []) {
  useEffect(() => {
    (async () => {
      await fn();
    })();
  }, deps);
}

export function App<Network>({sendRPC, web3, account, networkConfig}: AppPropsExt<Network>) {
  let { cTokenNames } = networkConfig;

  let timer = usePoll(5000);

  const signer = useMemo(() => {
    return web3.getSigner().connectUnchecked();
  }, [web3, account]);

  const cTokensInitial = () => new Map(
    cTokenNames.map<[CTokenSym<Network>, CTokenState]>(
      (cTokenName) => [cTokenName, { transfer: 0 }]));

  const initialAccountState = () => ({
    migratorEnabled: false,
    cTokens: cTokensInitial()
  });
  const [accountState, setAccountState] = useState<AccountState<Network>>(initialAccountState);

  const cTokenCtxs = useMemo(() => {
    return new Map(networkConfig.cTokenAbi.map(([cTokenName, address, abi]) =>
      [cTokenName, new Contract(address, abi ?? [], signer)]
    )) as Map<CTokenSym<Network>, Contract>}, [signer]);

  const migrator = useMemo(() => new Contract(networkConfig.migratorAddress, networkConfig.migratorAbi, signer), [signer]);
  const comet = useMemo(() => new Contract(networkConfig.rootsV3.comet, Comet, signer), [signer]);

  function setCTokenState<key extends keyof CTokenState, value extends CTokenState[key]>
    (tokenSym: CTokenSym<Network>, key: keyof CTokenState, value: CTokenState[key]) {
    console.log([tokenSym, key, value]);
    setAccountState({
      ...accountState,
      cTokens: new Map(Array.from(accountState.cTokens.entries()).map<[CTokenSym<Network>, CTokenState]>(([sym, state]) => {
        if (sym === tokenSym) {
          return [sym, {
            ...state,
            [key]: value
          }];
        } else {
          return [sym, state];
        }
      }))
    });
  }

  async function setTokenApproval(tokenSym: CTokenSym<Network>) {
    console.log("setting allowance");
    await cTokenCtxs.get(tokenSym)!.approve(migrator.address, MAX_UINT256);
    console.log("setting allowance");
  }

  async function enableMigrator() {
    console.log("enabling migrator");
    await comet.allow(migrator.address, true);
    console.log("enabled migrator");
  }

  useAsyncEffect(async () => {
    let migratorEnabled = (await comet.allowance(account, migrator.address))?.toBigInt() > 0n;
    console.log({migratorEnabled});
    let tokenStates = new Map(await Promise.all(Array.from(accountState.cTokens.entries()).map<Promise<[CTokenSym<Network>, CTokenState]>>(async ([sym, state]) => {
      return [sym, {
        ...state,
        balance: (await cTokenCtxs.get(sym)?.balanceOf(account))?.toBigInt(),
        allowance: (await cTokenCtxs.get(sym)?.allowance(account, migrator.address))?.toBigInt(),
        decimals: state.decimals ?? BigInt(await cTokenCtxs.get(sym)?.decimals() ?? 0)
      }];
    })));
    console.log({tokenStates});

    let usdcBorrowsV2 = await cTokenCtxs.get('cUSDC' as  CTokenSym<Network>)?.callStatic.borrowBalanceCurrent(account);

    setAccountState({
      migratorEnabled,
      borrowBalanceV2: usdcBorrowsV2.toString(),
      cTokens: tokenStates
    });
  }, [timer]);

  async function go() {
    console.log("go", accountState);
  };

  let el;
  if (accountState.migratorEnabled) {
    el = (<div>
      <div>
        { Array.from(accountState.cTokens.entries()).map(([sym, state]) => {
          return <div key={`${sym}`}>
            <label>{sym}</label>
            <span>balance={showAmount(state.balance, state.decimals)}</span>
            { state.allowance === 0n ?
              <button onClick={() => setTokenApproval(sym)}>Enable</button> :
              <span>
                { state.transfer === 'max' ?
                  <span>
                    <input disabled value="Max" />
                    <button onClick={() => setCTokenState(sym, 'transfer', 0)}>Max</button>
                  </span> :
                  <span>
                    <input type="number" value={state.transfer} onChange={(e) => setCTokenState(sym, 'transfer', Number(e.target.value))} />
                    <button onClick={() => setCTokenState(sym, 'transfer', 'max')}>Max</button>
                  </span>
                }
              </span>
            }
          </div>
        })}
      </div>
      <button onClick={go}>Fire Trx</button>
    </div>);
  } else {
    el = (<div>
      <button onClick={enableMigrator}>Enable Migrator</button>
    </div>);
  }

  return (
    <div className="container">
      Compound II to Compound III Migrator<br/>
      timer={ timer }<br/>
      account={ account }<br/>
      { el }
    </div>
  );
};

export default ({sendRPC, web3}: AppProps) => {
  let timer = usePoll(10000);
  const [account, setAccount] = useState<string | null>(null);
  const [network, setNetwork] = useState<Network | null>(null);

  useAsyncEffect(async () => {
    let accounts = await web3.listAccounts();
    console.log("accounts", accounts);
    if (accounts.length > 0) {
      let [account] = accounts;
      setAccount(account);
    }
  }, [timer]);

  useAsyncEffect(async () => {
    let networkWeb3 = await web3.getNetwork();
    console.log("network", networkWeb3);
    let network = getNetworkById(networkWeb3.chainId);
    if (network) {
      setNetwork(network);
    }
  }, [timer]);

  if (network && account) {
    let networkConfig = getNetworkConfig(network);
    return <App sendRPC={sendRPC} web3={web3} account={account} networkConfig={networkConfig} />;
  } else {
    return <div>Loading...</div>;
  }
};
