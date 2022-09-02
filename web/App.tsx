import '../styles/main.scss';
import { SendRPC } from './lib/useRPC';
import { read, write } from './lib/RPC';
import { useEffect, useState } from 'react';
import ERC20 from '../abis/ERC20';

import { JsonRpcProvider } from '@ethersproject/providers';

import cometV2MigratorAbi from '../abis/Comet_V2_Migrator';
import { Contract } from '@ethersproject/contracts';

import mainnetV3Roots from '../node_modules/comet/deployments/mainnet/usdc/roots.json';

import { Contracts as mainnetV2Roots } from '../node_modules/compound-config/networks/mainnet.json';
import mainnetV2Abi from '../node_modules/compound-config/networks/mainnet-abi.json';

const cTokenNames: (keyof (typeof mainnetV2Roots))[] = ["cZRX", "cWBTC", "cUSDT", "cUSDC", "cETH", "cSAI", "cREP", "cBAT", "cCOMP", "cLINK", "cUNI", "USDC"];
const cometV2MigratorAddress = "0xcbbe2a5c3a22be749d5ddf24e9534f98951983e2";

interface AppProps {
  sendRPC?: SendRPC
  web3: JsonRpcProvider
}

export default ({sendRPC, web3}: AppProps) => {
  const [timer, setTimer] = useState(0);
  const [account, setAccount] = useState('');
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [x, setX] = useState<string>('');

  const cTokens = Object.fromEntries(cTokenNames.map((cTokenName) => {
    return [cTokenName, new Contract(mainnetV2Roots[cTokenName], mainnetV2Abi[cTokenName], web3)];
  }));

  const migrator = new Contract(cometV2MigratorAddress, cometV2MigratorAbi, web3);

  useEffect(() => {
    let t;
    function loop(x, delay) {
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
    console.log("here");
    (async () => {
      setTimeout(async () => {
        console.log("getting accounts");
        let accounts = await web3.listAccounts();
        console.log("accounts", accounts);
        if (accounts.length > 0) {
          setAccount(accounts[0]);
          let tokenBalances = Object.fromEntries(await Promise.all(Object.entries(cTokens).map<Promise<[string, number]>>(async ([sym, token]) => {
            return [`${sym}`, (await token.balanceOf(accounts[0])).toNumber()];
          })));

          let usdcBorrowsV2 = await cTokens.cUSDC.callStatic.borrowBalanceCurrent(accounts[0]);

          setBalances({
            ...balances,
            ...tokenBalances,
            usdcBorrowsV2: usdcBorrowsV2.toString(),
          });

          setX(await migrator.comet());
        }
      }, 500)
    })();
  }, [timer]);

  async function go() {
    if (sendRPC) {
      let res = await write(sendRPC, '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', '0x313ce567');
      console.log("go:res", res);
    }
  };

  return (
    <div className="container">
      Comet v2 Migrator<br/>
      timer={ timer }<br/>
      account={ account }<br/>
      comet={ x }<br/>
      <div>
        { Object.entries(balances).map(([sym, balance]) => {
          return <div key={`${sym}-balance`}>
            <label>{sym}</label> <span>{balance}</span>
          </div>
        })}
      </div>
      <button onClick={go}>Fire Trx</button>
    </div>
  );
};
