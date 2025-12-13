import { useState, useCallback } from 'react';
import * as React from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { getProgram, getClusterName, PROGRAM_ID, checkRpcHealth } from './solana';
import { getGameConfigPda, getVaultPda, getBetPda, lamportsToSol, solToLamports } from './pda';

interface LogEntry {
  action: string;
  signature?: string;
  error?: string;
  timestamp: Date;
}

interface BetResult {
  diceResult: number;
  won: boolean;
  betAmount: number;
  payout: number;
  betType: string;
}

function VaultBalanceDisplay({ vaultPda, connection, gameConfig }: { vaultPda: PublicKey; connection: any; gameConfig: any }) {
  const [vaultLamports, setVaultLamports] = React.useState<number | null>(null);

  React.useEffect(() => {
    const fetchBalance = async () => {
      try {
        const accountInfo = await connection.getAccountInfo(vaultPda);
        setVaultLamports(accountInfo ? accountInfo.lamports : 0);
      } catch (err) {
        setVaultLamports(null);
      }
    };
    
    fetchBalance();
    const interval = setInterval(fetchBalance, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [vaultPda, connection]);

  if (vaultLamports === null) return null;

  const maxExposureBps = Number(gameConfig.maxExposureBps);
  const maxExposure = vaultLamports > 0 
    ? Math.floor((vaultLamports * maxExposureBps) / 10000)
    : 0;

  const minBet = gameConfig ? Number(gameConfig.minBet) : 0;
  const canPlaceMinBet = vaultLamports === 0 || maxExposure >= minBet;

  return (
    <div style={{ marginTop: '5px', fontSize: '12px', padding: '5px', background: canPlaceMinBet ? '#e8f4f8' : '#ffe0e0', borderRadius: '3px' }}>
      <div><strong>Vault SOL Balance:</strong> {lamportsToSol(vaultLamports).toFixed(4)} SOL</div>
      <div style={{ marginTop: '3px', color: maxExposure === 0 ? '#d00' : '#666' }}>
        <strong>Max Exposure per Bet:</strong> {lamportsToSol(maxExposure).toFixed(4)} SOL ({maxExposureBps / 100}% of vault)
        {maxExposure === 0 && vaultLamports === 0 && (
          <div style={{ fontSize: '11px', marginTop: '3px', color: '#666' }}>
            ✅ Vault has no SOL. Your first bet will fund the vault (exposure check skipped when vault is empty).
          </div>
        )}
        {maxExposure > 0 && canPlaceMinBet && (
          <div style={{ fontSize: '11px', marginTop: '3px', color: '#666' }}>
            💡 You can bet up to {lamportsToSol(maxExposure).toFixed(4)} SOL per bet
          </div>
        )}
        {maxExposure > 0 && gameConfig && !canPlaceMinBet && (
          <div style={{ fontSize: '11px', marginTop: '3px', color: '#d00', fontWeight: 'bold' }}>
            ⚠️ BLOCKED: Max exposure ({lamportsToSol(maxExposure).toFixed(4)} SOL) is less than minimum bet ({lamportsToSol(minBet).toFixed(4)} SOL). 
            <div style={{ marginTop: '3px' }}>
              Vault needs at least {lamportsToSol(Math.ceil((minBet * 10000) / maxExposureBps)).toFixed(4)} SOL to allow minimum bets. 
              Current: {lamportsToSol(vaultLamports).toFixed(4)} SOL.
            </div>
            <div style={{ marginTop: '3px', fontSize: '10px' }}>
              💡 Solution: Wait for more bets to accumulate in the vault, or the admin can fund the vault directly.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function App() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [gameInitialized, setGameInitialized] = useState<boolean | null>(null);
  const [gameConfig, setGameConfig] = useState<any>(null);
  const [vault, setVault] = useState<any>(null);
  const [rpcHealthy, setRpcHealthy] = useState<boolean | null>(null);
  const [rpcError, setRpcError] = useState<string | null>(null);

  // Initialize Game state
  const [houseEdgeBps, setHouseEdgeBps] = useState('200');
  const [minBetLamports, setMinBetLamports] = useState('100000000'); // 0.1 SOL
  const [maxBetLamports, setMaxBetLamports] = useState('10000000000'); // 10 SOL
  const [maxExposureBps, setMaxExposureBps] = useState('500');

  // Place Bet state
  const [betAmountLamports, setBetAmountLamports] = useState('100000000'); // 0.1 SOL
  const [betType, setBetType] = useState<'Over' | 'Under'>('Over');
  
  // Bet Result Modal state
  const [betResult, setBetResult] = useState<BetResult | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);

  // Helper to add log entry
  const addLog = useCallback((action: string, signature?: string, error?: string) => {
    setLogs(prev => [...prev, { action, signature, error, timestamp: new Date() }]);
  }, []);

  React.useEffect(() => {
    let mounted = true;
    
    const checkHealth = async () => {
      if (!connection) {
        if (mounted) {
          setRpcHealthy(null);
          setRpcError(null);
        }
        return;
      }
      
      try {
        // Use connection from wallet adapter context with 5 second timeout
        const health = await checkRpcHealth(connection, 5000);
        if (mounted) {
          setRpcHealthy(health.healthy);
          setRpcError(health.error || null);
        }
      } catch (err: any) {
        if (mounted) {
          setRpcHealthy(false);
          setRpcError(err?.message || 'Failed to check RPC health');
        }
      }
    };
    
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [connection]);

  // Check if game is initialized
  const checkGameStatus = useCallback(async () => {
    if (!wallet.publicKey) {
      setGameInitialized(null);
      return;
    }

    // Use connection from wallet adapter context
    const program = getProgram(wallet, connection);
    if (!program) {
      setGameInitialized(null);
      return;
    }

    try {
      const [gameConfigPda] = getGameConfigPda();
      const [vaultPda] = getVaultPda();

      const config = await program.account.gameConfig.fetch(gameConfigPda);
      const vaultData = await program.account.vault.fetch(vaultPda);

      setGameConfig(config);
      setVault(vaultData);
      setGameInitialized(true);
    } catch (err) {
      setGameInitialized(false);
      setGameConfig(null);
      setVault(null);
    }
  }, [wallet, connection]);

  React.useEffect(() => {
    if (wallet.publicKey) {
      checkGameStatus();
    } else {
      setGameInitialized(null);
    }
  }, [wallet.publicKey, checkGameStatus]);

  // Helper to extract human-readable error
  const extractError = (err: any): string => {
    // Check for RPC/network errors first
    if (err?.message?.includes('Failed to fetch') || err?.message?.includes('fetch')) {
      return `RPC Connection Error: ${err.message}. Check your internet connection and RPC endpoint.`;
    }
    if (err?.message?.includes('blockhash') || err?.message?.includes('blockhash')) {
      return `RPC Error: ${err.message}. The RPC endpoint may be unreachable or rate-limited.`;
    }
    if (err?.error?.errorMessage) return err.error.errorMessage;
    if (err?.error?.errorCode?.code) return err.error.errorCode.code;
    if (err?.message) return err.message;
    if (typeof err === 'string') return err;
    return 'Unknown error';
  };

  // Initialize Game
  const handleInitGame = useCallback(async () => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      addLog('Init Game', undefined, 'Wallet not connected');
      return;
    }

    const program = getProgram(wallet);
    if (!program) {
      addLog('Init Game', undefined, 'Failed to get program');
      return;
    }

    try {
      // Validate inputs
      const houseEdge = parseInt(houseEdgeBps);
      const minBet = parseInt(minBetLamports);
      const maxBet = parseInt(maxBetLamports);
      const maxExposure = parseInt(maxExposureBps);

      if (isNaN(houseEdge) || houseEdge < 0 || houseEdge > 1000) {
        addLog('Init Game', undefined, 'Invalid house edge (0-1000 bps)');
        return;
      }
      if (isNaN(minBet) || minBet <= 0) {
        addLog('Init Game', undefined, 'Invalid min bet (must be > 0)');
        return;
      }
      if (isNaN(maxBet) || maxBet < minBet) {
        addLog('Init Game', undefined, 'Invalid max bet (must be >= min bet)');
        return;
      }
      if (isNaN(maxExposure) || maxExposure <= 0 || maxExposure > 10000) {
        addLog('Init Game', undefined, 'Invalid max exposure (1-10000 bps)');
        return;
      }

      const [gameConfigPda] = getGameConfigPda();
      const [vaultPda] = getVaultPda();
      const health = await checkRpcHealth(connection, 5000);
      if (!health.healthy) {
        addLog('Init Game', undefined, `RPC Error: ${health.error || 'Connection failed'}`);
        setRpcHealthy(false);
        setRpcError(health.error || 'Connection failed');
        return;
      }

      // Send transaction
      const signature = await program.methods
        .initGame(
          new BN(houseEdge),
          new BN(minBet),
          new BN(maxBet),
          new BN(maxExposure)
        )
        .accounts({
          gameConfig: gameConfigPda,
          vault: vaultPda,
          admin: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Confirm transaction
      await connection.confirmTransaction(signature, 'confirmed');
      addLog('Init Game', signature);
      // Refresh game status
      await checkGameStatus();
    } catch (err) {
      addLog('Init Game', undefined, extractError(err));
    }
  }, [wallet, houseEdgeBps, minBetLamports, maxBetLamports, maxExposureBps, connection, addLog, checkGameStatus]);

  const fetchBetResult = useCallback(async (betPda: PublicKey, betAmount: number, betTypeStr: string) => {
    const program = getProgram(wallet, connection);
    if (!program) return;

    try {
      // Poll for bet result (try up to 10 times with 1 second delay)
      let bet: any = null;
      for (let i = 0; i < 10; i++) {
        try {
          bet = await program.account.bet.fetch(betPda);
          if (bet.status && bet.status.settled) {
            break;
          }
        } catch (err) {
          // Bet account might not be ready yet
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      if (!bet || !bet.status || !bet.status.settled) {
        addLog('Fetch Result', undefined, 'Bet not settled yet. Please check again later.');
        return;
      }

      const diceResult = bet.diceResult ? Number(bet.diceResult) : 0;
      const won = bet.won === true;
      const payout = bet.payout ? Number(bet.payout) : 0;

      const result: BetResult = {
        diceResult,
        won,
        betAmount,
        payout,
        betType: betTypeStr,
      };

      setBetResult(result);
      setShowResultModal(true);
      await checkGameStatus();
    } catch (err) {
      addLog('Fetch Result', undefined, extractError(err));
    }
  }, [wallet, connection, addLog, checkGameStatus]);

  const settleBet = useCallback(async (betPda: PublicKey, betIndex: number, betAmount: number, betTypeStr: string) => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      addLog('Settle Bet', undefined, 'Wallet not connected');
      return;
    }

    const program = getProgram(wallet, connection);
    if (!program) {
      addLog('Settle Bet', undefined, 'Failed to get program');
      return;
    }

    try {
      const [gameConfigPda] = getGameConfigPda();
      const [vaultPda] = getVaultPda();
      
      const vrfAccount = wallet.publicKey;
      
      addLog('Settle Bet', undefined, 'Requesting randomness...');
      const requestSig = await program.methods
        .requestRandomness()
        .accounts({
          gameConfig: gameConfigPda,
          bet: betPda,
          vrfAccount: vrfAccount,
        })
        .rpc();
      
      await connection.confirmTransaction(requestSig, 'confirmed');
      addLog('Settle Bet', requestSig, 'Randomness requested');
      
      const randomValue = new BN(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
      
      addLog('Settle Bet', undefined, 'Settling bet...');
      const settleSig = await program.methods
        .consumeRandomness(randomValue)
        .accounts({
          gameConfig: gameConfigPda,
          vault: vaultPda,
          vaultSystemAccount: vaultPda,
          bet: betPda,
          player: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      await connection.confirmTransaction(settleSig, 'confirmed');
      addLog('Settle Bet', settleSig, 'Bet settled');
      
      // Step 3: Fetch bet result
      await fetchBetResult(betPda, betAmount, betTypeStr);
    } catch (err) {
      addLog('Settle Bet', undefined, extractError(err));
    }
  }, [wallet, connection, addLog, fetchBetResult, checkGameStatus]);

  // Place Bet
  const handlePlaceBet = useCallback(async () => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      addLog('Place Bet', undefined, 'Wallet not connected');
      return;
    }

    // Use connection from wallet adapter context
    const program = getProgram(wallet, connection);
    if (!program) {
      addLog('Place Bet', undefined, 'Failed to get program');
      return;
    }

    try {
      // Validate input
      const amount = parseInt(betAmountLamports);
      if (isNaN(amount) || amount <= 0) {
        addLog('Place Bet', undefined, 'Invalid bet amount (must be > 0)');
        return;
      }

      const [gameConfigPda] = getGameConfigPda();
      const [vaultPda] = getVaultPda();
      let vault;
      let gameConfig;
      try {
        vault = await program.account.vault.fetch(vaultPda);
        const [gameConfigPda] = getGameConfigPda();
        gameConfig = await program.account.gameConfig.fetch(gameConfigPda);
      } catch (err) {
        addLog('Place Bet', undefined, 'Vault not initialized. Please initialize game first.');
        return;
      }

      // Get actual vault account balance (SOL in the account, not metadata)
      const vaultAccountInfo = await connection.getAccountInfo(vaultPda);
      const vaultLamports = vaultAccountInfo ? vaultAccountInfo.lamports : 0;

      // Check exposure limit before sending transaction
      // The program checks: if vault_lamports > 0, then amount must be <= max_exposure
      if (vaultLamports > 0) {
        const maxExposure = Math.floor((vaultLamports * Number(gameConfig.maxExposureBps)) / 10000);
        const minBet = Number(gameConfig.minBet);
        
        // Check if max exposure is less than minimum bet (edge case)
        if (maxExposure < minBet) {
          addLog('Place Bet', undefined, 
            `Vault balance too low: ${lamportsToSol(vaultLamports).toFixed(4)} SOL. Max exposure (${lamportsToSol(maxExposure).toFixed(4)} SOL) is less than minimum bet (${lamportsToSol(minBet).toFixed(4)} SOL). The vault needs at least ${lamportsToSol(Math.ceil((minBet * 10000) / Number(gameConfig.maxExposureBps))).toFixed(4)} SOL to allow minimum bets.`);
          return;
        }
        
        if (amount > maxExposure) {
          addLog('Place Bet', undefined, 
            `Bet exceeds max exposure limit. Max bet: ${lamportsToSol(maxExposure).toFixed(4)} SOL (${Number(gameConfig.maxExposureBps) / 100}% of vault balance: ${lamportsToSol(vaultLamports).toFixed(4)} SOL).`);
          return;
        }
      }

      const betIndex = Number(vault.totalBets);
      const [betPda] = getBetPda(wallet.publicKey, betIndex);

      // Send transaction
      const signature = await program.methods
        .placeBet(
          { [betType.toLowerCase()]: {} },
          new BN(amount)
        )
        .accounts({
          gameConfig: gameConfigPda,
          vault: vaultPda,
          vaultSystemAccount: vaultPda,
          bet: betPda,
          player: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Confirm transaction
      await connection.confirmTransaction(signature, 'confirmed');
      addLog('Place Bet', signature);
      
      // Refresh game status to update vault.totalBets
      await checkGameStatus();
      
      // Automatically settle the bet (request randomness + consume randomness)
      await settleBet(betPda, betIndex, amount, betType);
    } catch (err) {
      addLog('Place Bet', undefined, extractError(err));
    }
  }, [wallet, betAmountLamports, betType, connection, addLog, checkGameStatus, settleBet]);

  // Derive PDAs for display
  const [gameConfigPda] = getGameConfigPda();
  const [vaultPda] = getVaultPda();

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      {/* Logo */}
      <div style={{ marginBottom: '30px', textAlign: 'center' }}>
        <img 
          src="/sol casino.png" 
          alt="SOLANA CASINO - 7" 
          style={{ 
            maxWidth: '100%', 
            height: 'auto',
            maxHeight: '150px',
            objectFit: 'contain',
            display: 'block',
            margin: '0 auto'
          }}
          onError={(e) => {
            const img = e.target as HTMLImageElement;
            img.style.display = 'none';
            const parent = img.parentElement;
            if (parent && !parent.querySelector('.fallback-logo')) {
              const fallback = document.createElement('div');
              fallback.className = 'fallback-logo';
              fallback.style.cssText = 'font-size: 32px; font-weight: bold; color: #333;';
              fallback.textContent = 'SOLANA CASINO - 7';
              parent.appendChild(fallback);
            }
          }}
        />
      </div>

      {/* Wallet Connection */}
      <div style={{ marginBottom: '20px' }}>
        <WalletMultiButton />
      </div>

      {/* Connection Info */}
      {wallet.publicKey && (
        <div style={{ marginBottom: '20px', padding: '10px', background: '#f0f0f0', borderRadius: '5px' }}>
          <div><strong>Wallet:</strong> {wallet.publicKey.toString()}</div>
          <div><strong>Cluster:</strong> {getClusterName()}</div>
          <div><strong>Program ID:</strong> {PROGRAM_ID.toString()}</div>
          <div><strong>Game Config PDA:</strong> {gameConfigPda.toString()}</div>
          <div><strong>Vault PDA:</strong> {vaultPda.toString()}</div>
          
          {/* RPC Health Status */}
          <div style={{ marginTop: '10px', padding: '8px', background: rpcHealthy === false ? '#f8d7da' : rpcHealthy ? '#d4edda' : '#fff3cd', borderRadius: '3px' }}>
            <strong>RPC Status:</strong> {
              rpcHealthy === null ? '⏳ Checking...' :
              rpcHealthy ? '✅ Connected' : '❌ Connection Failed'
            }
            {rpcError && (
              <div style={{ marginTop: '5px', fontSize: '12px', color: '#d00' }}>
                Error: {rpcError}
                <div style={{ marginTop: '5px', fontSize: '11px' }}>
                  💡 Tip: The public RPC endpoint may be rate-limited. Consider using a dedicated RPC provider.
                </div>
              </div>
            )}
          </div>
          
          {/* Game Status */}
          <div style={{ marginTop: '10px', padding: '8px', background: gameInitialized ? '#d4edda' : '#f8d7da', borderRadius: '3px' }}>
            <strong>Game Status:</strong> {
              gameInitialized === null ? 'Checking...' :
              gameInitialized ? '✅ Initialized' : '❌ Not Initialized'
            }
            {gameInitialized && gameConfig && (
              <div style={{ marginTop: '5px', fontSize: '12px' }}>
                <div>Min Bet: {lamportsToSol(Number(gameConfig.minBet)).toFixed(4)} SOL</div>
                <div>Max Bet: {lamportsToSol(Number(gameConfig.maxBet)).toFixed(4)} SOL</div>
                <div>House Edge: {Number(gameConfig.houseEdgeBps) / 100}%</div>
                {vault && (
                  <>
                    <div>Total Bets: {Number(vault.totalBets)}</div>
                    <div>Vault Balance (metadata): {lamportsToSol(Number(vault.balance)).toFixed(4)} SOL</div>
                  </>
                )}
              </div>
            )}
            {gameInitialized && gameConfig && (
              <VaultBalanceDisplay 
                vaultPda={vaultPda} 
                connection={connection}
                gameConfig={gameConfig}
              />
            )}
          </div>
        </div>
      )}

      {/* Initialize Game Section */}
      <div style={{ marginBottom: '30px', padding: '15px', border: '1px solid #ccc', borderRadius: '5px' }}>
        <h2>Initialize Game (Admin Only)</h2>
        <div style={{ marginBottom: '10px' }}>
          <label>House Edge (bps): </label>
          <input
            type="number"
            value={houseEdgeBps}
            onChange={(e) => setHouseEdgeBps(e.target.value)}
            style={{ marginLeft: '10px', padding: '5px' }}
          />
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label>Min Bet (lamports): </label>
          <input
            type="number"
            value={minBetLamports}
            onChange={(e) => setMinBetLamports(e.target.value)}
            style={{ marginLeft: '10px', padding: '5px' }}
          />
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label>Max Bet (lamports): </label>
          <input
            type="number"
            value={maxBetLamports}
            onChange={(e) => setMaxBetLamports(e.target.value)}
            style={{ marginLeft: '10px', padding: '5px', width: '200px' }}
          />
          <span style={{ marginLeft: '10px', color: '#666', fontSize: '12px' }}>
            ({lamportsToSol(parseInt(maxBetLamports) || 0).toFixed(4)} SOL)
          </span>
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label>Max Exposure (bps): </label>
          <input
            type="number"
            value={maxExposureBps}
            onChange={(e) => setMaxExposureBps(e.target.value)}
            style={{ marginLeft: '10px', padding: '5px' }}
          />
        </div>
        <button
          onClick={handleInitGame}
          disabled={!wallet.publicKey || rpcHealthy === false}
          style={{ padding: '10px 20px', fontSize: '16px' }}
          title={rpcHealthy === false ? 'RPC connection failed. Check connection status above.' : ''}
        >
          Init Game
        </button>
        {rpcHealthy === false && (
          <div style={{ marginTop: '10px', color: '#d00', fontSize: '14px' }}>
            ⚠️ Cannot initialize: RPC connection failed. Please check your internet connection.
          </div>
        )}
      </div>

      {/* Place Bet Section */}
      <div style={{ marginBottom: '30px', padding: '15px', border: '1px solid #ccc', borderRadius: '5px' }}>
        <h2>Place Bet</h2>
        <div style={{ marginBottom: '10px' }}>
          <label>Amount (lamports): </label>
          <input
            type="number"
            value={betAmountLamports}
            onChange={(e) => setBetAmountLamports(e.target.value)}
            style={{ marginLeft: '10px', padding: '5px' }}
          />
          <span style={{ marginLeft: '10px', color: '#666' }}>
            ({lamportsToSol(parseInt(betAmountLamports) || 0).toFixed(4)} SOL)
          </span>
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label>Bet Type: </label>
          <label style={{ marginLeft: '10px' }}>
            <input
              type="radio"
              checked={betType === 'Over'}
              onChange={() => setBetType('Over')}
              style={{ marginRight: '5px' }}
            />
            Over
          </label>
          <label style={{ marginLeft: '10px' }}>
            <input
              type="radio"
              checked={betType === 'Under'}
              onChange={() => setBetType('Under')}
              style={{ marginRight: '5px' }}
            />
            Under
          </label>
        </div>
        {/* Check if bet is blocked by exposure limit */}
        {(() => {
          if (!gameInitialized || !gameConfig || !vault) return null;
          const vaultAccountInfo = vault; // We'll need to fetch this
          // This will be calculated in the component, but for now we'll check in the button handler
          return null;
        })()}
        
        <button
          onClick={handlePlaceBet}
          disabled={!wallet.publicKey || !gameInitialized}
          style={{ padding: '10px 20px', fontSize: '16px' }}
          title={!gameInitialized ? 'Game must be initialized first' : ''}
        >
          Place Bet
        </button>
        {!gameInitialized && wallet.publicKey && (
          <div style={{ marginTop: '10px', color: '#d00', fontSize: '14px' }}>
            ⚠️ Game not initialized. Please initialize the game first.
          </div>
        )}
      </div>

      {/* Logs Panel */}
      <div style={{ padding: '15px', border: '1px solid #ccc', borderRadius: '5px', maxHeight: '400px', overflowY: 'auto' }}>
        <h2>Logs</h2>
        {logs.length === 0 ? (
          <div style={{ color: '#666' }}>No logs yet</div>
        ) : (
          <div>
            {logs.slice().reverse().map((log, idx) => (
              <div
                key={idx}
                style={{
                  marginBottom: '10px',
                  padding: '8px',
                  background: log.error ? '#ffe0e0' : '#e0ffe0',
                  borderRadius: '3px',
                  fontSize: '12px',
                }}
              >
                <div><strong>{log.action}</strong> - {log.timestamp.toLocaleTimeString()}</div>
                {log.signature && (
                  <div style={{ marginTop: '5px', wordBreak: 'break-all' }}>
                    TX: {log.signature}
                  </div>
                )}
                {log.error && (
                  <div style={{ marginTop: '5px', color: '#d00' }}>
                    Error: {log.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showResultModal && betResult && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }} onClick={() => setShowResultModal(false)}>
          <div style={{
            backgroundColor: '#fff',
            padding: '30px',
            borderRadius: '10px',
            maxWidth: '500px',
            width: '90%',
            textAlign: 'center',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ 
              marginTop: 0, 
              color: betResult.won ? '#28a745' : '#dc3545',
              fontSize: '28px'
            }}>
              {betResult.won ? '🎉 YOU WON! 🎉' : '😔 You Lost'}
            </h2>
            
            <div style={{ fontSize: '72px', margin: '20px 0' }}>
              🎲 {betResult.diceResult} 🎲
            </div>
            
            <div style={{ fontSize: '18px', marginBottom: '20px', color: '#666' }}>
              <div><strong>Bet Type:</strong> {betResult.betType}</div>
              <div style={{ marginTop: '10px' }}>
                <strong>Dice Roll:</strong> {betResult.diceResult}
              </div>
            </div>
            
            <div style={{
              backgroundColor: betResult.won ? '#d4edda' : '#f8d7da',
              padding: '15px',
              borderRadius: '5px',
              marginBottom: '20px',
            }}>
              <div style={{ fontSize: '16px', marginBottom: '5px' }}>
                <strong>Bet Amount:</strong> {lamportsToSol(betResult.betAmount).toFixed(4)} SOL
              </div>
              {betResult.won ? (
                <div style={{ fontSize: '20px', color: '#28a745', fontWeight: 'bold' }}>
                  <strong>Winnings:</strong> {lamportsToSol(betResult.payout).toFixed(4)} SOL
                </div>
              ) : (
                <div style={{ fontSize: '18px', color: '#dc3545' }}>
                  <strong>Loss:</strong> {lamportsToSol(betResult.betAmount).toFixed(4)} SOL
                </div>
              )}
            </div>
            
            <button
              onClick={() => setShowResultModal(false)}
              style={{
                padding: '12px 30px',
                fontSize: '16px',
                backgroundColor: '#007bff',
                color: '#fff',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
