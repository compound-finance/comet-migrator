import '../styles/main.scss';
import { SendRPC } from './lib/useRPC';
import { read, write } from './lib/RPC';
import { useEffect, useState } from 'react';
import ERC20 from '../abis/ERC20';

import { JsonRpcProvider } from '@ethersproject/providers';

import cometV2MigratorAbi from '../abis/Comet_V2_Migrator';
import { Contract } from '@ethersproject/contracts';

import kovanV3Roots from '../node_modules/comet/deployments/kovan/usdc/roots.json';
import mainnetV3Roots from '../node_modules/comet/deployments/mainnet/usdc/roots.json';

import { Contracts as kovanV2Roots } from '../node_modules/compound-config/networks/kovan.json';
import { Contracts as mainnetV2Roots } from '../node_modules/compound-config/networks/mainnet.json';

const cTokenNames: (keyof (typeof mainnetV2Roots))[] = ["cZRX", "cWBTC", "cUSDT", "cUSDC", "cETH", "cSAI", "cREP", "cBAT", "cCOMP", "cLINK"];
const cometV2MigratorAddress = "0xf5c4a909455C00B99A90d93b48736F3196DB5621";

interface AppProps {
  sendRPC?: SendRPC
  web3: JsonRpcProvider
}

export default ({sendRPC, web3}: AppProps) => {
  const [account, setAccount] = useState('');
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [x, setX] = useState<string>('');

  const cTokens = Object.fromEntries(cTokenNames.map((cTokenName) => {
    return [cTokenName, new Contract(mainnetV2Roots[cTokenName], ERC20, web3)];
  }));

  const migrator = new Contract(cometV2MigratorAddress, cometV2MigratorAbi, web3);

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
            return [sym, (await token.balanceOf(accounts[0])).toNumber()];
          })));

          setBalances({
            ...balances,
            ...tokenBalances
          });

          setX(await migrator.comet());
        }
      }, 500)
    })();
  }, []);

  // async function sayHello() {
  //   let res = await read(sendRPC, '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', '0x313ce567');
  //   console.log("sayHello:res", res);
  // };

  async function go() {
    if (sendRPC) {
      let res = await write(sendRPC, '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', '0x313ce567');
      console.log("go:res", res);
    }
  };

  return (
    <div className="container">
      Hello World<br/>
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
