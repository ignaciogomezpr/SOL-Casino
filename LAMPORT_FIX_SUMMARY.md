# Lamport Mutation Fix Summary

## Problem Analysis

The error "instruction spent from the balance of an account it does not own" occurs when a program tries to directly modify lamports of an account it doesn't own. In Solana, programs can only modify lamports of accounts they own, or they must use Cross-Program Invocations (CPI) to the System Program for transfers.

## Issues Found and Fixed

### ✅ Issue 1: Direct Lamport Mutation in `place_bet` (FIXED)
**Original Code (Lines 82-84):**
```rust
// ❌ WRONG: Direct lamport mutation
**ctx.accounts.player.to_account_info().try_borrow_mut_lamports()? -= amount;
**ctx.accounts.vault_system_account.to_account_info().try_borrow_mut_lamports()? += amount;
```

**Fixed Code (Lines 82-94):**
```rust
// ✅ CORRECT: CPI transfer via System Program
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
```

### ✅ Issue 2: Direct Lamport Mutation in `consume_randomness` (FIXED)
**Original Code (Lines 197-198):**
```rust
// ❌ WRONG: Direct lamport mutation
**ctx.accounts.vault_system_account.to_account_info().try_borrow_mut_lamports()? -= payout;
**ctx.accounts.player.to_account_info().try_borrow_mut_lamports()? += payout;
```

**Fixed Code (Lines 205-229):**
```rust
// ✅ CORRECT: CPI transfer with PDA signer
if won && payout > 0 {
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
    
    // Update vault balance (metadata only, not actual SOL)
    vault.balance = vault.balance.checked_sub(payout).unwrap();
}
```

## Vault PDA Implementation

### Correct Account Structure

The vault uses a **dual-account pattern** where the same PDA address is used in two ways:

1. **`vault: Account<'info, Vault>`** - Typed account for storing metadata (balance, total_bets, total_volume)
2. **`vault_system_account: UncheckedAccount<'info>`** - Same PDA used as SystemAccount for SOL transfers

### Correct `#[derive(Accounts)]` Definition

```rust
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
```

### Initialization in `InitGame`

```rust
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
```

## Key Points

1. **All SOL transfers use CPI**: Both player → vault and vault → player transfers use System Program CPI
2. **PDA signing for payouts**: When transferring from vault (PDA) to player, we use `invoke_signed` with the vault PDA seeds
3. **No direct lamport mutation**: All lamport changes go through System Program CPI
4. **Vault metadata vs SOL**: The `vault.balance` field is just metadata tracking; actual SOL is held by the vault_system_account PDA
5. **Same PDA, different views**: The vault PDA serves dual purpose - typed account for data, SystemAccount for SOL

## Verification Checklist

- ✅ No `try_borrow_mut_lamports()` calls
- ✅ No `realloc()` calls that modify lamports
- ✅ No `close()` calls that modify lamports
- ✅ All SOL transfers use `invoke()` or `invoke_signed()`
- ✅ Vault PDA properly initialized as program-owned account
- ✅ Vault PDA can receive SOL via CPI transfers
- ✅ Payouts use `invoke_signed()` with correct PDA seeds

## Testing

After these fixes, the program should:
- Successfully transfer SOL from player to vault via CPI
- Successfully transfer SOL from vault to player via CPI with PDA signer
- No longer throw "instruction spent from the balance of an account it does not own" errors
