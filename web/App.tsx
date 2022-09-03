import '../styles/main.scss';
import { SendRPC } from './lib/useRPC';
import { read, write } from './lib/RPC';
import { useEffect, useMemo, useState } from 'react';
import ERC20 from '../abis/ERC20';
import Comet from '../abis/Comet';

import { JsonRpcProvider } from '@ethersproject/providers';

import cometV2MigratorAbi from '../abis/Comet_V2_Migrator';
import { Contract, ContractInterface } from '@ethersproject/contracts';

import mainnetV3Roots from '../node_modules/comet/deployments/mainnet/usdc/roots.json';

import { Contracts as mainnetV2Roots } from '../node_modules/compound-config/networks/mainnet.json';
import mainnetV2Abi from '../node_modules/compound-config/networks/mainnet-abi.json';

type CTokenSym = (keyof (typeof mainnetV2Roots));

const cTokenNames: CTokenSym[] = ["cZRX", "cWBTC", "cUSDT", "cUSDC", "cETH", "cSAI", "cREP", "cBAT", "cCOMP", "cLINK", "cUNI"];
const cometV2MigratorAddress = "0xcbbe2a5c3a22be749d5ddf24e9534f98951983e2";

function getCTokenSym(x: string): CTokenSym | undefined {
  for (let sym of cTokenNames) {
    if (sym.toString() === x) {
      return sym;
    }
  }
}

const mainnetCTokenAbi: Map<CTokenSym, ContractInterface> = new Map();
for (let [key, abi] of Object.entries(mainnetV2Abi)) {
  let sym = getCTokenSym(key);
  if (sym) {
    mainnetCTokenAbi.set(sym, abi);
  }
}

const MAX_UINT256 = BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935');

interface AppProps {
  sendRPC?: SendRPC
  web3: JsonRpcProvider
}

interface AccountState {
  account?: string,
  migratorEnabled: boolean,
  borrowBalanceV2?: bigint
  cTokens: Map<CTokenSym, CTokenState>
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

export default ({sendRPC, web3}: AppProps) => {
  const [timer, setTimer] = useState(0);
  const cTokensInitial = () => new Map(
    cTokenNames.map<[CTokenSym, CTokenState]>(
      (cTokenName) => [cTokenName, { transfer: 0 }]));

  const initialAccountState = () => ({
    migratorEnabled: false,
    cTokens: cTokensInitial()
  });
  const [accountState, setAccountState] = useState<AccountState>(initialAccountState);

  const signer = useMemo(() => {
    return web3.getSigner().connectUnchecked();
  }, [web3, accountState.account]);

  const cTokenCtxs = useMemo(() => {
    return new Map(cTokenNames.map((cTokenName) =>
      [cTokenName, new Contract(mainnetV2Roots[cTokenName], mainnetCTokenAbi.get(cTokenName) ?? [], signer)]
    )) as Map<CTokenSym, Contract>}, [signer]);

  const migrator = useMemo(() => new Contract(cometV2MigratorAddress, cometV2MigratorAbi, signer), [signer]);
  const comet = useMemo(() => new Contract(mainnetV3Roots.comet, Comet, signer), [signer]);

  function setCTokenState<key extends keyof CTokenState, value extends CTokenState[key]>
    (tokenSym: CTokenSym, key: keyof CTokenState, value: CTokenState[key]) {
    console.log([tokenSym, key, value]);
    setAccountState({
      ...accountState,
      cTokens: new Map(Array.from(accountState.cTokens.entries()).map<[CTokenSym, CTokenState]>(([sym, state]) => {
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

  async function setTokenApproval(tokenSym: CTokenSym) {
    console.log("setting allowance");
    await cTokenCtxs.get(tokenSym)!.approve(migrator.address, MAX_UINT256);
    console.log("setting allowance");
  }

  async function enableMigrator() {
    console.log("enabling migrator");
    await comet.allow(migrator.address, true);
    console.log("enabled migrator");
  }

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
    loop(1, 10000);
    return () => clearTimeout(t)
  }, []);

  useEffect(() => {
    (async () => {
      let accounts = await web3.listAccounts();
      console.log("accounts", accounts);
      if (accounts.length > 0) {
        let [account] = accounts;
        setAccountState({
          ...accountState,
          account
        });
        let migratorEnabled = (await comet.allowance(account, migrator.address)).toBigInt() > 0n;
        console.log({migratorEnabled});
        let tokenStates = new Map(await Promise.all(Array.from(accountState.cTokens.entries()).map<Promise<[CTokenSym, CTokenState]>>(async ([sym, state]) => {
          return [`${sym}`, {
            ...state,
            balance: (await cTokenCtxs.get(sym)?.balanceOf(account)).toBigInt(),
            allowance: (await cTokenCtxs.get(sym)?.allowance(account, migrator.address)).toBigInt(),
            decimals: state.decimals ?? BigInt(await cTokenCtxs.get(sym)?.decimals())
          }];
        })));

        let usdcBorrowsV2 = await cTokenCtxs.get('cUSDC')?.callStatic.borrowBalanceCurrent(account);

        setAccountState({
          account,
          migratorEnabled,
          borrowBalanceV2: usdcBorrowsV2.toString(),
          cTokens: tokenStates
        });
      }
    })();
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
      account={ accountState.account }<br/>
      { el }
    </div>
  );
};
