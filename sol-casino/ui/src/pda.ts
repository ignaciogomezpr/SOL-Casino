import { PublicKey } from '@solana/web3.js';
import { PROGRAM_ID } from './solana';

// PDA seeds (from program source: lib.rs)
const GAME_CONFIG_SEED = Buffer.from('game_config');
const VAULT_SEED = Buffer.from('vault');
const BET_SEED = Buffer.from('bet');

/**
 * Derive GameConfig PDA
 * Seeds: [b"game_config"]
 */
export function getGameConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [GAME_CONFIG_SEED],
    PROGRAM_ID
  );
}

/**
 * Derive Vault PDA
 * Seeds: [b"vault"]
 * Note: Requires vault_bump from GameConfig if you need the exact bump
 * For most cases, findProgramAddressSync will work
 */
export function getVaultPda(vaultBump?: number): [PublicKey, number] {
  if (vaultBump !== undefined) {
    return PublicKey.findProgramAddressSync(
      [VAULT_SEED],
      PROGRAM_ID
    );
  }
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED],
    PROGRAM_ID
  );
}

/**
 * Derive Bet PDA
 * Seeds: [b"bet", player, bet_index (as little-endian u64)]
 * 
 * @param player - Player's public key
 * @param betIndex - Bet index (vault.total_bets at creation time)
 */
export function getBetPda(player: PublicKey, betIndex: number | bigint): [PublicKey, number] {
  const betIndexBuffer = Buffer.allocUnsafe(8);
  if (typeof betIndex === 'bigint') {
    betIndexBuffer.writeBigUInt64LE(betIndex, 0);
  } else {
    betIndexBuffer.writeBigUInt64LE(BigInt(betIndex), 0);
  }

  return PublicKey.findProgramAddressSync(
    [BET_SEED, player.toBuffer(), betIndexBuffer],
    PROGRAM_ID
  );
}

// Helper to convert lamports to SOL for display
export function lamportsToSol(lamports: number | bigint): number {
  return Number(lamports) / 1e9;
}

// Helper to convert SOL to lamports
export function solToLamports(sol: number): number {
  return Math.floor(sol * 1e9);
}
