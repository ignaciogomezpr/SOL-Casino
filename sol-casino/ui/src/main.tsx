import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { CLUSTER, RPC_ENDPOINTS } from './solana';
import App from './App';
import '@solana/wallet-adapter-react-ui/styles.css';
import './index.css';

// Get network based on cluster
const network = CLUSTER === 'localnet' 
  ? WalletAdapterNetwork.Devnet // Wallet adapter doesn't have localnet, use devnet
  : WalletAdapterNetwork.Devnet;

// Initialize wallets
const wallets = [
  new PhantomWalletAdapter(),
  new SolflareWalletAdapter(),
];

function Main() {
  const endpoint = RPC_ENDPOINTS[CLUSTER];

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <App />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Main />
  </React.StrictMode>
);
