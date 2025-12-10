use anchor_lang::prelude::*;
use anchor_lang::solana_program::system_program;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod sol_casino {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Sol Casino program initialized!");
        Ok(())
    }
}

// Bet types: Over 7, Under 7, or Exactly 7
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum BetType {
    Under,  // 2-6
    Exactly, // 7
    Over,   // 8-12
}

// Bet status tracking
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum BetStatus {
    Pending,      // Bet placed, waiting for randomness
    RandomnessRequested, // VRF request sent
    Settled,      // Bet resolved and payout processed
}

// GameConfig account - stores game rules and configuration
#[account]
pub struct GameConfig {
    pub admin: Pubkey,              // Admin authority
    pub house_edge_bps: u16,        // House edge in basis points (200 = 2%)
    pub min_bet: u64,               // Minimum bet amount in lamports
    pub max_bet: u64,               // Maximum bet amount in lamports
    pub max_exposure_bps: u16,       // Max exposure per bet as % of vault (200 = 2%)
    pub paused: bool,                // Pause new bets flag
    pub vault_bump: u8,              // Vault PDA bump seed
    pub vrf_account: Option<Pubkey>, // Switchboard VRF account (optional for now)
}

impl GameConfig {
    pub const SIZE: usize = 8 +      // discriminator
        32 +                         // admin
        2 +                          // house_edge_bps
        8 +                          // min_bet
        8 +                          // max_bet
        2 +                          // max_exposure_bps
        1 +                          // paused
        1 +                          // vault_bump
        1 + 32;                      // Option<Pubkey> (1 byte + 32 bytes)
}

// Vault PDA - holds all game funds securely
#[account]
pub struct Vault {
    pub balance: u64,               // Current vault balance in lamports
    pub total_bets: u64,            // Total number of bets placed
    pub total_volume: u64,          // Total volume wagered
}

impl Vault {
    pub const SIZE: usize = 8 +      // discriminator
        8 +                          // balance
        8 +                          // total_bets
        8;                           // total_volume
}

// Bet account - tracks individual bets until settlement
#[account]
pub struct Bet {
    pub player: Pubkey,              // Player who placed the bet
    pub bet_type: BetType,           // Over/Under/Exactly 7
    pub amount: u64,                 // Bet amount in lamports
    pub status: BetStatus,           // Current bet status
    pub vrf_request_key: Option<Pubkey>, // VRF request account (when randomness requested)
    pub dice_result: Option<u8>,     // Final dice roll result (2-12) after settlement
    pub won: Option<bool>,           // Whether player won (None if not settled)
    pub payout: Option<u64>,         // Payout amount (None if not settled)
    pub timestamp: i64,              // Unix timestamp when bet was placed
}

impl Bet {
    pub const SIZE: usize = 8 +      // discriminator
        32 +                         // player
        1 +                          // bet_type
        8 +                          // amount
        1 +                          // status
        1 + 32 +                     // Option<Pubkey> vrf_request_key
        1 + 1 +                      // Option<u8> dice_result
        1 + 1 +                      // Option<bool> won
        1 + 8 +                      // Option<u64> payout
        8;                           // timestamp
}

#[derive(Accounts)]
pub struct Initialize {}
