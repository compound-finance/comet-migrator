import '../styles/main.scss';
import { CometState, RPC, read, write } from '@compound-finance/comet-extension';
import { Fragment, useEffect, useMemo, useState } from 'react';
import ERC20 from '../abis/ERC20';
import Comet from '../abis/Comet';
import { CTokenSym, Network, NetworkConfig, getNetwork, getNetworkById, getNetworkConfig, isNetwork, showNetwork } from './Network';
import { JsonRpcProvider } from '@ethersproject/providers';
import { Contract, ContractInterface } from '@ethersproject/contracts';
import { Close } from './Icons/Close';
import { CircleCheckmark } from './Icons/CircleCheckmark';

const MAX_UINT256 = BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935');

interface AppProps {
  rpc?: RPC,
  web3: JsonRpcProvider
}

type AppPropsExt<N extends Network> = AppProps & {
  account: string,
  networkConfig: NetworkConfig<N>
};

interface AccountState<Network> {
  error: string | null;
  migratorEnabled: boolean;
  borrowBalanceV2?: bigint;
  usdcDecimals?: bigint;
  repayAmount: string;
  cTokens: Map<CTokenSym<Network>, CTokenState>;
}

interface CTokenState {
  address?: string,
  balance?: bigint,
  balanceUnderlying?: number,
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

function showAmount(amount: bigint | undefined, decimals: bigint | undefined, format: boolean = true): string | React.ReactNode {
  let number: number;
  if (amount && decimals) {
    number = weiToAmount(amount, decimals);
  } else {
    number = 0;
  }

  if (format) {
    let s = number.toFixed(4);
    let [pre, post] = s.split('.');
    return (<Fragment>
      <span className="text-color--1">{pre}</span>
      <span className="text-color--3">.{post}</span>
    </Fragment>);
  } else {
    return number.toFixed(4);
  }
}

function formatNumber(number: number): React.ReactNode {
  let s = number.toFixed(4);
  let [pre, post] = s.split('.');
  return (<Fragment>
    <span className="text-color--1">{pre}</span>
    <span className="text-color--3">.{post}</span>
  </Fragment>);
}

function weiToAmount(wei: bigint | undefined, decimals: bigint | undefined): number {
  if (wei && decimals) {
    return Number(wei) / Number(10n ** decimals);
  } else {
    return 0;
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

function parseNumber<T>(str: string, f: (x: number) => bigint): bigint | null {
  if (str === 'max') {
    return MAX_UINT256;
  } else {
    let num = Number(str);
    if (Number.isNaN(num)) {
      return null;
    } else {
      return f(num);
    }
  }
}

function getDocument(f: (document: HTMLDocument) => void) {
  if (document.readyState !== 'loading') {
    f(document);
  } else {
    window.addEventListener('DOMContentLoaded', (event) => {
      f(document);
    });
  }
}

export function App<N extends Network>({rpc, web3, account, networkConfig}: AppPropsExt<N>) {
  let { cTokenNames } = networkConfig;
  let [cometState, setCometState] = useState<CometState>(['loading', null]);

  useEffect(() => {
    if (rpc) {
      console.log("setting RPC");
      rpc.on({
        setTheme: ({theme}) => {
          console.log('theme', theme);
          getDocument((document) => {
            console.log("document", document);
            document.body.classList.add('theme');
            document.body.classList.remove(`theme--dark`);
            document.body.classList.remove(`theme--light`);
            document.body.classList.add(`theme--${theme.toLowerCase()}`);
          });
        },
        setCometState: ({cometState: cometStateNew}) => {
          console.log("Setting comet state", cometStateNew);
          setCometState(cometStateNew);
        }
      });
    }
  }, [rpc]);

  let timer = usePoll(10000);

  const signer = useMemo(() => {
    return web3.getSigner().connectUnchecked();
  }, [web3, account]);

  const cTokensInitial = () => new Map(
    cTokenNames.map<[CTokenSym<Network>, CTokenState]>(
      (cTokenName) => [cTokenName, { transfer: "0" }]));

  const initialAccountState = () => ({
    error: null,
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
      error: null,
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

  async function disableMigrator() {
    console.log("disabling migrator");
    await comet.allow(migrator.address, false);
    console.log("disabling migrator");
  }

  useAsyncEffect(async () => {
    let migratorEnabled = (await comet.allowance(account, migrator.address))?.toBigInt() > 0n;
    let tokenStates = new Map(await Promise.all(Array.from(accountState.cTokens.entries()).map<Promise<[CTokenSym<Network>, CTokenState]>>(async ([sym, state]) => {
      let cTokenCtx = cTokenCtxs.get(sym);

      if (cTokenCtx) {
        let underlyingDecimals: bigint = state.underlyingDecimals ?? ( 'underlying' in cTokenCtx ? BigInt(await (new Contract(await cTokenCtx.underlying(), ERC20, web3)).decimals()) : 18n );
        let balance: bigint = (await cTokenCtx.balanceOf(account)).toBigInt();
        let exchangeRate: bigint = (await cTokenCtx.callStatic.exchangeRateCurrent()).toBigInt();
        let balanceUnderlying = weiToAmount(balance * exchangeRate / 1000000000000000000n, underlyingDecimals);

        return [sym, {
          ...state,
          address: await cTokenCtx.address,
          balance,
          balanceUnderlying,
          allowance: (await cTokenCtx.allowance(account, migrator.address)).toBigInt(),
          exchangeRate,
          decimals: state.decimals ?? BigInt(await cTokenCtx.decimals()),
          underlyingDecimals,
        }];
      } else {
        return [sym, state];
      }
    })));
    console.log("tokenStates", tokenStates);

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
  }, [timer, account, networkConfig.network, cTokenCtxs]);

  function validateForm(): { borrowAmount: bigint, collateral: Collateral[] } | string {
    let borrowAmount = accountState.borrowBalanceV2;
    let usdcDecimals = accountState.usdcDecimals;
    if (!accountState.migratorEnabled) {
      return "";
    }
    if (!borrowAmount || !usdcDecimals) {
      return "";
    }
    let repayAmount = parseNumber(accountState.repayAmount, (n) => amountToWei(n, usdcDecimals!));
    if (repayAmount === null) {
      return "Invalid repay amount";
    }
    if (repayAmount !== MAX_UINT256 && repayAmount > borrowAmount) {
      return "Too much repay";
    }

    let collateral: Collateral[] = [];
    for (let [sym, {address, balance, balanceUnderlying, decimals, underlyingDecimals, transfer, exchangeRate}] of accountState.cTokens.entries()) {
      if (address !== undefined && decimals !== undefined && underlyingDecimals !== undefined && balance !== undefined && exchangeRate !== undefined) {
        if (transfer === 'max') {
          collateral.push({
            cToken: address,
            amount: balance
          });
        } else {
          if (balanceUnderlying && Number(transfer) > balanceUnderlying) {
            return `Exceeded collateral amount for ${sym}`;
          }
          let transferAmount = parseNumber(transfer, (n) => amountToWei(n * 1e18 / Number(exchangeRate), underlyingDecimals!));
          if (transferAmount === null) {
            return `Invalid collateral amount ${sym}: ${transfer}`;
          } else {
            if (transferAmount > 0n) {
              collateral.push({
                cToken: address,
                amount: transferAmount
              });
            }
          }
        }
      }
    }
    return {
      borrowAmount: repayAmount,
      collateral
    };
  }

  let migrateParams = accountState.error ?? validateForm();

  async function migrate() {
    console.log("migrate", accountState, migrateParams);
    if (typeof migrateParams !== 'string') {
      try {
        await migrator.migrate(migrateParams.collateral, migrateParams.borrowAmount);
      } catch (e: any) {
        if ('code' in e && e.code === 'UNPREDICTABLE_GAS_LIMIT') {
          setAccountState({
            ...accountState,
            error: "Migration will fail if sent, e.g. due to collateral factors. Please adjust parameters."
          });
        }
      }
    }
  };

  let collateralWithBalances = Array.from(accountState.cTokens.entries()).filter(([sym, state]) => {
    return state.balance && state.balance > 0n;
  });

  let collateralEl;
  if (collateralWithBalances.length === 0) {
    collateralEl = <div className="asset-row asset-row--active L3">
      <p className="L2 text-color--1">
        Any collateral balances in Compound V2 will appear here.
      </p>
    </div>;
  } else {
    collateralEl = collateralWithBalances.map(([sym, state]) => {
      return <div className="asset-row asset-row--active L3" key={sym}>
        <div className="asset-row__detail-content">
          <span className={`asset asset--${sym.slice(1)}`} />
          <div className="asset-row__info">
            { state.transfer === 'max' ?
              <input className="action-input-view__input text-color--3" style={{fontSize: "2rem"}} disabled value="Max" /> :
              <input className="action-input-view__input" style={{fontSize: "2rem"}} type="text" inputMode="decimal" value={state.transfer} onChange={(e) => setCTokenState(sym, 'transfer', e.target.value)} />
            }
          </div>
        </div>
        <div className="asset-row__balance">
          <p className="body text-color--3">
            {formatNumber(state.balanceUnderlying ?? 0)}
          </p>
        </div>
        <div className="asset-row__actions">{ state.allowance === 0n ?
            <button className="button button--selected" onClick={() => setTokenApproval(sym)}>
              <span>Enable</span>
            </button>
          : (
            state.transfer === 'max' ?
              <button className="button button--selected" onClick={() => setCTokenState(sym, 'transfer', '0')}>
                <Close />
                <span>Max</span>
              </button>
            :
              <button className="button button--selected" onClick={() => setCTokenState(sym, 'transfer', 'max')}>
                <span>Max</span>
              </button>
            )
          }
        </div>
      </div>
    });
  }

  let innerEl = (<Fragment>
    <div className="panel__header-row">
      <label className="L1 label text-color--2">Borrowing</label>
    </div>
    <div className="asset-row asset-row--active L3">
      <div className="asset-row__detail-content">
        <span className={`asset asset--${'USDC'}`} />
        <div className="asset-row__info">
          { accountState.repayAmount === 'max' ?
            <input className="action-input-view__input text-color--3" style={{fontSize: "2rem"}} disabled value="Max" /> :
            <input className="action-input-view__input" style={{fontSize: "2rem"}} type="text" inputMode="decimal" value={accountState.repayAmount} onChange={(e) => setAccountState({...accountState, repayAmount: e.target.value})} />
          }
        </div>
      </div>
      <div className="asset-row__balance">
        <p className="body text-color--3">
          {showAmount(accountState.borrowBalanceV2, accountState.usdcDecimals)}
        </p>
      </div>
      <div className="asset-row__actions">{ accountState.repayAmount === 'max' ?
          <button className="button button--selected" onClick={() => setAccountState({...accountState, repayAmount: '0'})}>
            <Close />
            <span>Max</span>
          </button>
        :
          <button className="button button--selected" onClick={() => setAccountState({...accountState, repayAmount: 'max'})}>
            <span>Max</span>
          </button>
        }
      </div>
    </div>
    <div className="panel__header-row">
      <label className="L1 label text-color--2">Supplying</label>
    </div>
    <div>
      { collateralEl }
    </div>
  </Fragment>);

  return (
    <div className="page home">
      <div className="container">
        <div className="masthead L1">
          <h1 className="L0 heading heading--emphasized">Compound V2 Migration Tool (USDC)</h1>
          { accountState.migratorEnabled ?
            <button className="button button--large button--supply" onClick={disableMigrator}>
              <CircleCheckmark />
              <label>Enabled</label>
            </button> :
            <button className="button button--large button--supply" onClick={enableMigrator}>Enable</button> }
        </div>
        <div className="home__content">
          <div className="home__assets">
            <div className="panel panel--assets">
              <div className="panel__header-row">
                <label className="L1 label text-color--1">V2 Balances</label>
              </div>
              <div className="panel__header-row">
                <label className="label text-color--1">
                  Select the assets you want to migrate from Compound V2 to Compound V3.
                  If you are supplying USDC on one market while borrowing on another, any
                  supplied USDC will be used to repay borrowed USDC before entering you
                  into an earning position in Compound V3.
                </label>
              </div>
              { innerEl }
              <div className="panel__header-row">
                <label className="L1 label text-color--2">Debug Information</label>
                <label className="label text-color--2">
                  timer={ timer }<br/>
                  network={ showNetwork(networkConfig.network) }<br/>
                  account={ account }<br/>
                </label>
              </div>
            </div>
          </div>
          <div className="home__sidebar">
            <div className="position-card__summary">
              <div className="panel position-card L3">
                <div className="panel__header-row">
                  <label className="L1 label text-color--1">Summary</label>
                </div>
                <div className="panel__header-row">
                  <p className="text-color--1">
                    If you are borrowing other assets on Compound V2,
                    migrating too much collateral could increase your
                    liquidation risk.
                  </p>
                </div>
                { typeof migrateParams === 'string' ?
                  <div className="panel__header-row">
                    <div className="action-input-view action-input-view--error L2">
                      { migrateParams.length > 0 ? <label className="action-input-view__title">
                        { migrateParams }
                      </label> : null }
                    </div>
                  </div> : null
                }
                <div className="panel__header-row">
                  <button className="button button--large" disabled={typeof migrateParams === 'string'} onClick={migrate}>Migrate Balances</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ({rpc, web3}: AppProps) => {
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
      return <App rpc={rpc} web3={web3} account={account} networkConfig={networkConfig} />;
    }
  } else {
    return <div>Loading...</div>;
  }
};
