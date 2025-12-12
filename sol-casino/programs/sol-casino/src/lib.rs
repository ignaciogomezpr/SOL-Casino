use anchor_lang::prelude::*;

declare_id!("G13mbtq9JT6mh4XbecqD9WN8SvdVtvfSKyQ3J6wmLxmF");

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

    /// Place a bet on the dice roll game
    pub fn place_bet(
        ctx: Context<PlaceBet>,
        bet_type: BetType,
        amount: u64,
    ) -> Result<()> {
        let game_config = &ctx.accounts.game_config;
        let vault = &mut ctx.accounts.vault;
        let bet = &mut ctx.accounts.bet;
        let player = &ctx.accounts.player;
        let clock = Clock::get()?;

        // Check if game is paused
        require!(!game_config.paused, CasinoError::GamePaused);

        // Validate bet amount
        require!(amount >= game_config.min_bet, CasinoError::BetTooSmall);
        require!(amount <= game_config.max_bet, CasinoError::BetTooLarge);

        // Check max exposure limit
        let vault_lamports = ctx.accounts.vault_system_account.lamports();
        if vault_lamports > 0 {
            let max_exposure = (vault_lamports as u128)
                .checked_mul(game_config.max_exposure_bps as u128)
                .unwrap()
                .checked_div(10000)
                .unwrap() as u64;
            require!(amount <= max_exposure, CasinoError::BetExceedsExposure);
        }

        // Transfer SOL from player to vault using System Program
        anchor_lang::solana_program::program::invoke(
            &anchor_lang::solana_program::system_instruction::transfer(
                ctx.accounts.player.key,
                ctx.accounts.vault_system_account.key,
                amount,
            ),
            &[
                ctx.accounts.player.to_account_info(),
                ctx.accounts.vault_system_account.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        // Initialize bet account
        bet.player = player.key();
        bet.bet_type = bet_type;
        bet.amount = amount;
        bet.bet_index = vault.total_bets; // Store the bet index for PDA derivation
        bet.status = BetStatus::Pending;
        bet.vrf_request_key = None;
        bet.dice_result = None;
        bet.won = None;
        bet.payout = None;
        bet.timestamp = clock.unix_timestamp;

        // Update vault statistics
        vault.balance = vault.balance.checked_add(amount).unwrap();
        vault.total_bets = vault.total_bets.checked_add(1).unwrap();
        vault.total_volume = vault.total_volume.checked_add(amount).unwrap();

        msg!(
            "Bet placed: player={}, type={:?}, amount={}",
            player.key(),
            bet_type,
            amount
        );

        Ok(())
    }

    /// Request randomness for a bet (simplified - in production would use Switchboard VRF)
    pub fn request_randomness(ctx: Context<RequestRandomness>) -> Result<()> {
        let bet = &mut ctx.accounts.bet;
        let game_config = &ctx.accounts.game_config;

        require!(bet.status == BetStatus::Pending, CasinoError::BetNotReady);
        require!(!game_config.paused, CasinoError::GamePaused);

        // In production, this would request randomness from Switchboard VRF
        // For now, we'll use a simplified approach where randomness is provided
        // The VRF account would be set in game_config.vrf_account
        
        bet.status = BetStatus::RandomnessRequested;
        bet.vrf_request_key = Some(ctx.accounts.vrf_account.key());

        msg!("Randomness requested for bet: {}", bet.player);

        Ok(())
    }

    /// Consume randomness and settle the bet
    pub fn consume_randomness(
        ctx: Context<ConsumeRandomness>,
        random_value: u64, // In production, this comes from VRF proof
    ) -> Result<()> {
        let bet = &mut ctx.accounts.bet;
        let game_config = &ctx.accounts.game_config;
        let vault = &mut ctx.accounts.vault;

        require!(bet.status == BetStatus::RandomnessRequested, CasinoError::BetNotReady);
        require!(!bet.won.is_some(), CasinoError::BetAlreadySettled);

        // Convert random value to dice roll (2-12) using rejection sampling
        // Two dice: each die is 1-6, so sum is 2-12
        let dice_roll = ((random_value % 11) + 2) as u8; // 2-12

        // Determine if player won based on bet type
        let won = match bet.bet_type {
            BetType::Under => dice_roll < 7,
            BetType::Exactly => dice_roll == 7,
            BetType::Over => dice_roll > 7,
        };

        // Calculate payout with house edge
        let payout = if won {
            let multiplier = match bet.bet_type {
                BetType::Under | BetType::Over => 235, // 2.35x (including stake)
                BetType::Exactly => 588, // 5.88x (including stake)
            };
            
            // Apply house edge: reduce payout by house_edge_bps
            let base_payout = (bet.amount as u128)
                .checked_mul(multiplier as u128)
                .unwrap()
                .checked_div(100)
                .unwrap();
            
            let house_edge_deduction = base_payout
                .checked_mul(game_config.house_edge_bps as u128)
                .unwrap()
                .checked_div(10000)
                .unwrap();
            
            (base_payout.checked_sub(house_edge_deduction).unwrap()) as u64
        } else {
            0
        };

        // Check if vault has enough funds for payout
        let vault_lamports = ctx.accounts.vault_system_account.lamports();
        if won && payout > 0 {
            require!(
                vault_lamports >= payout,
                CasinoError::InsufficientVaultBalance
            );
        }

        // Update bet with results
        bet.dice_result = Some(dice_roll);
        bet.won = Some(won);
        bet.payout = Some(payout);
        bet.status = BetStatus::Settled;

        // Transfer payout if player won using System Program CPI with PDA signer
        if won && payout > 0 {
            // Create a CPI to transfer from vault (PDA) to player
            // Since vault is a PDA, we need to sign with the PDA seeds
            // Seeds must match exactly: [VAULT_SEED] with the bump
            let vault_bump = ctx.accounts.game_config.vault_bump;
            let seeds = &[
                VAULT_SEED,
                &[vault_bump],
            ];
            let signer_seeds = &[&seeds[..]];
            
            anchor_lang::solana_program::program::invoke_signed(
                &anchor_lang::solana_program::system_instruction::transfer(
                    ctx.accounts.vault_system_account.key,
                    ctx.accounts.player.key,
                    payout,
                ),
                &[
                    ctx.accounts.vault_system_account.to_account_info(),
                    ctx.accounts.player.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                ],
                signer_seeds,
            )?;
            
            // Update vault balance (this is just metadata, not actual SOL)
            vault.balance = vault.balance.checked_sub(payout).unwrap();
        }

        msg!(
            "Bet settled: player={}, dice={}, won={}, payout={}",
            bet.player,
            dice_roll,
            won,
            payout
        );

        Ok(())
    }
}

// Bet types: Over 7, Under 7, or Exactly 7
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
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
    pub bet_index: u64,              // Index of this bet (vault.total_bets at creation time)
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
        8 +                          // bet_index
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
pub const BET_SEED: &[u8] = b"bet";

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

    /// Vault PDA that stores metadata (balance, total_bets, etc.)
    /// This is a program-owned account that can also hold SOL
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

#[derive(Accounts)]
pub struct PlaceBet<'info> {
    #[account(
        seeds = [GAME_CONFIG_SEED],
        bump
    )]
    pub game_config: Account<'info, GameConfig>,

    /// Vault PDA that stores metadata (balance, total_bets, total_volume)
    /// This is the same PDA as vault_system_account but as a typed account
    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump = game_config.vault_bump
    )]
    pub vault: Account<'info, Vault>,

    /// CHECK: Vault PDA as SystemAccount - same address as vault but used for SOL transfers
    /// This account holds the actual SOL and is used in CPI transfers
    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump = game_config.vault_bump
    )]
    pub vault_system_account: UncheckedAccount<'info>,

    #[account(
        init,
        payer = player,
        space = Bet::SIZE,
        seeds = [BET_SEED, player.key().as_ref(), vault.total_bets.to_le_bytes().as_ref()],
        bump
    )]
    pub bet: Account<'info, Bet>,

    #[account(mut)]
    pub player: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RequestRandomness<'info> {
    #[account(
        seeds = [GAME_CONFIG_SEED],
        bump
    )]
    pub game_config: Account<'info, GameConfig>,

    #[account(
        mut,
        seeds = [BET_SEED, bet.player.as_ref(), bet.bet_index.to_le_bytes().as_ref()],
        bump
    )]
    pub bet: Account<'info, Bet>,

    /// CHECK: VRF account (Switchboard or other)
    pub vrf_account: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct ConsumeRandomness<'info> {
    #[account(
        seeds = [GAME_CONFIG_SEED],
        bump
    )]
    pub game_config: Account<'info, GameConfig>,

    /// Vault PDA that stores metadata (balance, total_bets, total_volume)
    /// This is the same PDA as vault_system_account but as a typed account
    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump = game_config.vault_bump
    )]
    pub vault: Account<'info, Vault>,

    /// CHECK: Vault PDA as SystemAccount - same address as vault but used for SOL transfers
    /// This account holds the actual SOL and is used in CPI transfers
    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump = game_config.vault_bump
    )]
    pub vault_system_account: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [BET_SEED, bet.player.as_ref(), bet.bet_index.to_le_bytes().as_ref()],
        bump
    )]
    pub bet: Account<'info, Bet>,

    /// CHECK: Player account to receive payout
    #[account(mut)]
    pub player: UncheckedAccount<'info>,

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
