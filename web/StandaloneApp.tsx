import './init';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { Web3Provider } from '@ethersproject/providers';
import { initializeConnector } from '@web3-react/core';
import { MetaMask } from '@web3-react/metamask';

const [metamask, metamaskHooks] = initializeConnector<MetaMask>((actions) => new MetaMask({ actions }));

function StandaloneApp() {
  const web3 = metamaskHooks.useProvider<Web3Provider>();

  React.useEffect(() => {
    metamask.activate();
  }, []);

  if (web3) {
    return <App web3={web3 as any} />
  } else {
    return <div>Connecting...</div>;
  }
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <StandaloneApp />
  </React.StrictMode>
)
