import { Connection, PublicKey, Commitment } from '@solana/web3.js';
import { AnchorProvider, Program, Idl } from '@coral-xyz/anchor';
import { WalletContextState } from '@solana/wallet-adapter-react';
import idlJson from './idl.json';

// Cluster configuration - change this to switch between devnet and localnet
export const CLUSTER: 'devnet' | 'localnet' = 'devnet';

// RPC endpoints
// Using public RPC endpoints - for production, use a dedicated RPC provider (Helius, QuickNode, etc.)
export const RPC_ENDPOINTS = {
  // Public devnet endpoint (may have rate limits)
  devnet: 'https://api.devnet.solana.com',
  // Alternative: Use a free RPC provider like Helius or QuickNode for better reliability
  // devnet: 'https://devnet.helius-rpc.com/?api-key=YOUR_KEY',
  localnet: 'http://localhost:8899',
};

// Program ID from IDL
const idl = idlJson as Idl;
export const PROGRAM_ID = new PublicKey((idl as any).address);

// Get connection based on cluster
export function getConnection(): Connection {
  const endpoint = RPC_ENDPOINTS[CLUSTER];
  
  // Validate endpoint
  if (!endpoint) {
    throw new Error(`RPC endpoint not defined for cluster: ${CLUSTER}`);
  }
  
  // For devnet, ensure HTTPS
  if (CLUSTER === 'devnet' && !endpoint.startsWith('https://')) {
    console.warn('Devnet endpoint should use HTTPS for browser compatibility');
  }
  
  return new Connection(endpoint, 'confirmed' as Commitment);
}

// Health check for RPC connection with timeout
export async function checkRpcHealth(connection: Connection, timeoutMs: number = 5000): Promise<{ healthy: boolean; error?: string }> {
  try {
    // Create a promise that rejects after timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('RPC health check timeout')), timeoutMs);
    });

    // Race between getVersion and timeout
    await Promise.race([
      connection.getVersion(),
      timeoutPromise
    ]);
    
    return { healthy: true };
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    // Provide more specific error messages
    if (errorMsg.includes('timeout')) {
      return { healthy: false, error: 'RPC endpoint not responding (timeout). Check your connection or try a different RPC provider.' };
    }
    if (errorMsg.includes('Failed to fetch') || errorMsg.includes('fetch')) {
      return { healthy: false, error: 'Network error: Cannot reach RPC endpoint. Check your internet connection.' };
    }
    return { healthy: false, error: errorMsg };
  }
}

// Get provider from wallet
export function getProvider(wallet: WalletContextState, connection?: Connection): AnchorProvider | null {
  if (!wallet.publicKey || !wallet.signTransaction) {
    return null;
  }

  // Use provided connection or create new one
  const conn = connection || getConnection();
  const provider = new AnchorProvider(
    conn,
    wallet as any,
    { commitment: 'confirmed' }
  );

  return provider;
}

// Get program instance
export function getProgram(wallet: WalletContextState, connection?: Connection): Program | null {
  const provider = getProvider(wallet, connection);
  if (!provider) {
    return null;
  }

  return new Program(idl, provider);
}

// Get cluster name for display
export function getClusterName(): string {
  return CLUSTER === 'localnet' ? 'Localnet' : 'Devnet';
}
