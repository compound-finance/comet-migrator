import '../styles/main.scss';
import { SendRPC } from './lib/useRPC';
import { read, write } from './lib/RPC';
import { useEffect, useMemo, useState } from 'react';
import ERC20 from '../abis/ERC20';
import Comet from '../abis/Comet';
import { CTokenSym, Network, NetworkConfig, getNetwork, getNetworkById, getNetworkConfig, isNetwork, showNetwork } from './Network';
import { JsonRpcProvider } from '@ethersproject/providers';
import { Contract, ContractInterface } from '@ethersproject/contracts';

const MAX_UINT256 = BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935');

interface AppProps {
  sendRPC?: SendRPC
  web3: JsonRpcProvider
}

type AppPropsExt<N extends Network> = AppProps & {
  account: string,
  networkConfig: NetworkConfig<N>
};

interface AccountState<Network> {
  migratorEnabled: boolean;
  borrowBalanceV2?: bigint;
  usdcDecimals?: bigint;
  repayAmount: string;
  cTokens: Map<CTokenSym<Network>, CTokenState>;
}

interface CTokenState {
  address?: string,
  balance?: bigint,
  allowance?: bigint,
  exchangeRate?: bigint,
  transfer: string | 'max',
  decimals?: bigint,
  underlyingDecimals?: bigint,
}

interface Collateral {
  cToken: string,
  amount: bigint
}

function showAmount(amount: bigint | undefined, decimals: bigint | undefined): string {
  if (amount && decimals) {
    return (Number(amount) / Number(10n ** decimals)).toFixed(4);
  } else {
    return '';
  }
}

function amountToWei(amount: number, decimals: bigint): bigint {
  return BigInt(Math.floor(Number(amount) * Number(10n ** decimals)));
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

function parseNumber(str: string): number | null {
  let num = Number(str);
  if (Number.isNaN(num)) {
    return null;
  } else {
    return num;
  }
}

export function App<N extends Network>({sendRPC, web3, account, networkConfig}: AppPropsExt<N>) {
  let { cTokenNames } = networkConfig;

  let timer = usePoll(20000);

  const signer = useMemo(() => {
    return web3.getSigner().connectUnchecked();
  }, [web3, account]);

  const cTokensInitial = () => new Map(
    cTokenNames.map<[CTokenSym<Network>, CTokenState]>(
      (cTokenName) => [cTokenName, { transfer: "0" }]));

  const initialAccountState = () => ({
    migratorEnabled: false,
    repayAmount: "0",
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
    if (migratorEnabled) {
      let tokenStates = new Map(await Promise.all(Array.from(accountState.cTokens.entries()).map<Promise<[CTokenSym<Network>, CTokenState]>>(async ([sym, state]) => {
        let cTokenCtx = cTokenCtxs.get(sym)!;

        return [sym, {
          ...state,
          address: await cTokenCtx.address,
          balance: (await cTokenCtx.balanceOf(account)).toBigInt(),
          allowance: (await cTokenCtx.allowance(account, migrator.address)).toBigInt(),
          exchangeRate: (await cTokenCtx.callStatic.exchangeRateCurrent()).toBigInt(),
          decimals: state.decimals ?? BigInt(await cTokenCtx.decimals()),
          underlyingDecimals: state.underlyingDecimals ?? ( 'underlying' in cTokenCtx ? BigInt(await (new Contract(await cTokenCtx.underlying(), ERC20, web3)).decimals()) : 18n )
        }];
      })));

      let cUSDC = cTokenCtxs.get('cUSDC' as  CTokenSym<Network>);
      let usdcBorrowsV2 = await cUSDC?.callStatic.borrowBalanceCurrent(account);
      let usdcDecimals = cUSDC ? BigInt(await (new Contract(await cUSDC.underlying(), ERC20, web3)).decimals()) : 0n;

      setAccountState({
        ...accountState,
        migratorEnabled,
        borrowBalanceV2: usdcBorrowsV2.toString(),
        usdcDecimals: BigInt(usdcDecimals),
        cTokens: tokenStates
      });
    } else {
      setAccountState({
        ...accountState,
        migratorEnabled
      });
    }
  }, [timer, account, cTokenCtxs]);

  function validateForm(): { borrowAmount: bigint, collateral: Collateral[] } | string {
    let borrowAmount = accountState.borrowBalanceV2;
    let usdcDecimals = accountState.usdcDecimals;
    if (!borrowAmount || !usdcDecimals) {
      return "Invalid borrowAmount || usdcDecimals";
    }
    let repayAmount = parseNumber(accountState.repayAmount);
    if (repayAmount === null) {
      return "Invalid repay amount";
    }
    let repayAmountWei = amountToWei(repayAmount, usdcDecimals);
    if (repayAmountWei > borrowAmount) {
      return "Too much repay";
    }

    let collateral: Collateral[] = [];
    for (let [sym, {address, balance, decimals, underlyingDecimals, transfer, exchangeRate}] of accountState.cTokens.entries()) {
      if (address !== undefined && decimals !== undefined && underlyingDecimals !== undefined && balance !== undefined) {
        if (transfer === 'max') {
          collateral.push({
            cToken: address,
            amount: balance
          });
        } else {
          let transferNum = parseNumber(transfer);
          if (transferNum === null) {
            return `Invalid collateral amount ${sym}: ${transfer}`;
          } else {
            if (transferNum > 0 && exchangeRate) {
              // TODO: Check too much
              collateral.push({
                cToken: address,
                amount: amountToWei(transferNum * 1e18 / Number(exchangeRate), underlyingDecimals)
              });
            }
          }
        }
      }
    }
    return {
      borrowAmount: repayAmountWei,
      collateral
    };
  }

  let migrateParams = validateForm();

  async function migrate() {
    console.log("migrate", accountState, migrateParams);
    if (typeof migrateParams !== 'string') {
      await migrator.migrate(migrateParams.collateral, migrateParams.borrowAmount);
    }
  };

  let el;
  if (accountState.migratorEnabled) {
    el = (<div>
      <div>
        <label>cUSDC Repay</label>
        <span>balance={showAmount(accountState.borrowBalanceV2, accountState.usdcDecimals)}</span>
        <input type="text" inputMode="decimal" value={accountState.repayAmount} onChange={(e) => setAccountState({...accountState, repayAmount: e.target.value})} />
      </div>
      <div>
        { Array.from(accountState.cTokens.entries()).map(([sym, state]) => {
          return <div key={`${sym}`}>
            <label>{sym}</label>
            <span>balance={showAmount(state.exchangeRate ? (state.balance ?? 0n) * state.exchangeRate / 1000000000000000000n : 0n, state.underlyingDecimals)}</span>
            { state.allowance === 0n ?
              <button onClick={() => setTokenApproval(sym)}>Enable</button> :
              <span>
                { state.transfer === 'max' ?
                  <span>
                    <input disabled value="Max" />
                    <button onClick={() => setCTokenState(sym, 'transfer', 0)}>Max</button>
                  </span> :
                  <span>
                    <input type="text" inputMode="decimal" value={state.transfer} onChange={(e) => setCTokenState(sym, 'transfer', e.target.value)} />
                    <button onClick={() => setCTokenState(sym, 'transfer', 'max')}>Max</button>
                  </span>
                }
              </span>
            }
          </div>
        })}
      </div>
      {
        typeof migrateParams === 'string' ?
          <div>
            <label>{ migrateParams }</label>
            <button disabled={true}>Migrate</button>
          </div> :
          <div>
            <button onClick={migrate}>Migrate</button>
          </div>
      }
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
      network={ showNetwork(networkConfig.network) }<br/>
      account={ account }<br/>
      { el }
    </div>
  );
};

export default ({sendRPC, web3}: AppProps) => {
  let timer = usePoll(10000);
  const [account, setAccount] = useState<string | null>(null);
  const [networkConfig, setNetworkConfig] = useState<NetworkConfig<Network> | 'unsupported' | null>(null);

  useAsyncEffect(async () => {
    let accounts = await web3.listAccounts();
    if (accounts.length > 0) {
      let [account] = accounts;
      setAccount(account);
    }
  }, [web3, timer]);

  useAsyncEffect(async () => {
    let networkWeb3 = await web3.getNetwork();
    let network = getNetworkById(networkWeb3.chainId);
    if (network) {
      setNetworkConfig(getNetworkConfig(network));
    } else {
      setNetworkConfig('unsupported');
    }
  }, [web3, timer]);

  if (networkConfig && account) {
    if (networkConfig === 'unsupported') {
      return <div>Unsupported network...</div>;
    } else {
      return <App sendRPC={sendRPC} web3={web3} account={account} networkConfig={networkConfig} />;
    }
  } else {
    return <div>Loading...</div>;
  }
};
