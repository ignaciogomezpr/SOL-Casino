use anchor_lang::prelude::*;
use anchor_lang::solana_program::system_program;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod sol_casino {
    use super::*;

    /// Initialize the game with configuration and create vault PDA
    pub fn init_game(
        ctx: Context<InitGame>,
        house_edge_bps: u16,
        min_bet: u64,
        max_bet: u64,
        max_exposure_bps: u16,
    ) -> Result<()> {
        let game_config = &mut ctx.accounts.game_config;
        let vault = &mut ctx.accounts.vault;

        // Validate parameters
        require!(house_edge_bps <= 1000, CasinoError::InvalidHouseEdge); // Max 10%
        require!(min_bet > 0, CasinoError::InvalidBetAmount);
        require!(max_bet >= min_bet, CasinoError::InvalidBetAmount);
        require!(max_exposure_bps > 0 && max_exposure_bps <= 10000, CasinoError::InvalidExposure); // Max 100%

        // Initialize game config
        game_config.admin = ctx.accounts.admin.key();
        game_config.house_edge_bps = house_edge_bps;
        game_config.min_bet = min_bet;
        game_config.max_bet = max_bet;
        game_config.max_exposure_bps = max_exposure_bps;
        game_config.paused = false;
        game_config.vault_bump = ctx.bumps.vault;
        game_config.vrf_account = None; // Will be set later

        // Initialize vault
        vault.balance = 0;
        vault.total_bets = 0;
        vault.total_volume = 0;

        msg!(
            "Game initialized: admin={}, house_edge={}bps, min_bet={}, max_bet={}",
            game_config.admin,
            house_edge_bps,
            min_bet,
            max_bet
        );

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

// Seeds for PDAs
pub const GAME_CONFIG_SEED: &[u8] = b"game_config";
pub const VAULT_SEED: &[u8] = b"vault";

#[derive(Accounts)]
pub struct InitGame<'info> {
    #[account(
        init,
        payer = admin,
        space = GameConfig::SIZE,
        seeds = [GAME_CONFIG_SEED],
        bump
    )]
    pub game_config: Account<'info, GameConfig>,

    #[account(
        init,
        payer = admin,
        space = Vault::SIZE,
        seeds = [VAULT_SEED],
        bump
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

// Custom error codes
#[error_code]
pub enum CasinoError {
    #[msg("Invalid house edge: must be between 0 and 1000 basis points (0-10%)")]
    InvalidHouseEdge,
    
    #[msg("Invalid bet amount: min_bet must be > 0 and max_bet >= min_bet")]
    InvalidBetAmount,
    
    #[msg("Invalid max exposure: must be between 1 and 10000 basis points (0.01-100%)")]
    InvalidExposure,
    
    #[msg("Game is paused")]
    GamePaused,
    
    #[msg("Bet amount below minimum")]
    BetTooSmall,
    
    #[msg("Bet amount above maximum")]
    BetTooLarge,
    
    #[msg("Bet exceeds max exposure limit")]
    BetExceedsExposure,
    
    #[msg("Insufficient vault balance for payout")]
    InsufficientVaultBalance,
    
    #[msg("Unauthorized: admin only")]
    Unauthorized,
    
    #[msg("Bet already settled")]
    BetAlreadySettled,
    
    #[msg("Bet not ready for settlement")]
    BetNotReady,
}
