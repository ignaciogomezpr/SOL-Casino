# How to Run and Test $SOL Casino

This guide explains how to run and test both the Solana program and the Next.js frontend.

## Prerequisites

1. **Install Solana CLI** (if not already installed):
   ```bash
   # Primary method (official)
   sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
   
   # Alternative method (if SSL errors occur - use Anza URL)
   sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
   
   # Or using Homebrew (if installed)
   brew install solana
   ```
   
   **Note:** If you get `SSL_ERROR_SYSCALL` errors, use the Anza URL or check if Solana is already installed with `solana --version`. See Troubleshooting section #10 for more details.

2. **Install Anchor** (if not already installed):
   ```bash
   cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
   avm install latest
   avm use latest
   ```

3. **Install Node.js** (v18 or higher recommended)

4. **Set up Solana wallet** (for testing):
   ```bash
   solana-keygen new
   # Or use existing keypair at ~/.config/solana/id.json
   ```

5. **Configure Solana CLI for devnet**:
   ```bash
   solana config set --url devnet
   ```

6. **Get devnet SOL** (for testing):
   ```bash
   solana airdrop 2
   ```
   
   **Note:** If you get a rate limit error, try:
   - Wait a few minutes and try again
   - Request smaller amounts: `solana airdrop 1` (can request up to 2 SOL per request, max 5 SOL per day)
   - Use a Solana faucet website: https://faucet.solana.com/
   - Use the Solana CLI with a different amount: `solana airdrop 0.5`
   - For local testing, use `anchor test` which starts a local validator with unlimited SOL

---

## Part 1: Running and Testing the Solana Program

### Step 1: Navigate to the project root
```bash
cd sol-casino
# Make sure you're in: SOL-Casino/sol-casino/
# You should see package.json, Anchor.toml, and programs/ directory
```

### Step 2: Install dependencies
```bash
npm install
# This installs Anchor and Solana dependencies for testing
```

### Step 3: Build the program

**Option A: Using Anchor CLI** (if version matches):
```bash
anchor build
```

**Option B: Using Cargo directly** (if Anchor CLI version mismatch):
```bash
# IMPORTANT: You must be in the program directory, not the workspace root
cd programs/sol-casino
cargo build-sbf
# Make sure you're in: SOL-Casino/sol-casino/programs/sol-casino/
# You should see Cargo.toml and src/lib.rs in this directory
```

**Note:** If you get a "could not find Cargo.toml" error, make sure you're in the `programs/sol-casino/` directory, not the workspace root.

This will:
- Compile the Rust program
- Generate the IDL (Interface Definition Language) file (with `anchor build`)
- Create the program keypair if needed

### Step 4: Run tests

**⚠️ Note:** If you get an Anchor version mismatch error, `anchor test` will be blocked. Here are your options:

**Option A: If Anchor CLI version matches** (recommended):
```bash
anchor test
```

**Option B: Manual test setup** (if version mismatch):
Since `anchor test` is blocked by version checks, you'll need to:

1. **Generate IDL and types** (requires matching Anchor version):
   ```bash
   anchor idl build
   anchor idl type target/idl/sol_casino.json > target/types/sol_casino.ts
   ```

2. **Start local validator manually**:
   ```bash
   solana-test-validator --reset
   # Keep this running in a separate terminal
   ```

3. **Deploy the program**:
   ```bash
   solana program deploy target/deploy/sol_casino.so --url localhost
   ```

4. **Run tests**:
   ```bash
   npx ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts
   ```

**Option C: Use npm test** (may also be blocked):
```bash
npm test
```

**What `anchor test` normally does:**
- Start a local validator (if needed)
- Deploy the program
- Run all tests in the `tests/` directory
- Clean up after tests complete

### Step 5: Run tests with verbose output
```bash
anchor test --skip-local-validator
```

To skip starting a local validator (useful if you want to use devnet directly).

---

## Part 2: Running the Next.js Frontend

### Step 1: Navigate to the app directory
```bash
cd app
```

### Step 2: Install dependencies
```bash
npm install
```

### Step 3: Run the development server
```bash
npm run dev
```

The app will be available at `http://localhost:3000`

### Step 4: Build for production
```bash
npm run build
```

### Step 5: Start production server
```bash
npm start
```

### Step 6: Run linter
```bash
npm run lint
```

---

## Part 3: Manual Testing Workflow

### Testing the Solana Program Manually

1. **Build and deploy to devnet**:
   ```bash
   anchor build
   anchor deploy --provider.cluster devnet
   ```

2. **Interact with the program** using Solana CLI or a script:
   ```bash
   # Example: Initialize the game
   anchor run init-game
   ```

3. **Check program logs**:
   ```bash
   solana logs
   ```

### Testing the Frontend Manually

1. **Start the dev server**:
   ```bash
   cd app
   npm run dev
   ```

2. **Connect a wallet** (Phantom, Solflare, etc.) to the app

3. **Test the betting flow**:
   - Connect wallet
   - Place a bet
   - Check transaction on Solana Explorer
   - Verify bet settlement

---

## Part 4: Writing Tests

### Test File Structure

Tests should be placed in the `tests/` directory and follow this structure:

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolCasino } from "../target/types/sol_casino";
import { expect } from "chai";

describe("sol-casino", () => {
  // Configure the client
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SolCasino as Program<SolCasino>;

  it("Initializes the game", async () => {
    // Test code here
  });
});
```

### Example Test Cases to Implement

1. **Test `init_game`**:
   - Valid initialization
   - Invalid house edge
   - Invalid bet amounts
   - Admin-only access

2. **Test `place_bet`**:
   - Valid bet placement
   - Bet too small
   - Bet too large
   - Bet exceeds exposure
   - Game paused

3. **Test `request_randomness`**:
   - Valid randomness request
   - Invalid bet status

4. **Test `consume_randomness`**:
   - Win scenario (Over)
   - Win scenario (Under)
   - Win scenario (Exactly 7)
   - Loss scenario
   - Payout calculation
   - Insufficient vault balance

---

## Known Issues

### Anchor Version Compatibility

**Current Status:** 
- Project is configured to use Anchor 0.31.1
- All dependencies (`Cargo.toml`, `package.json`, `Anchor.toml`) are set to 0.31.1
- Anchor 0.30.1 has compatibility issues with newer Rust toolchains (proc_macro2 API changes)

**If you need to update Anchor version:**
1. Update `Anchor.toml`:
   ```toml
   [toolchain]
   anchor_version = "0.31.1"  # or your desired version
   ```

2. Update `programs/sol-casino/Cargo.toml`:
   ```toml
   [dependencies]
   anchor-lang = "0.31.1"
   anchor-spl = "0.31.1"
   
   [features]
   idl-build = ["anchor-lang/idl-build", "anchor-spl/idl-build"]
   ```

3. Update `package.json`:
   ```json
   "@coral-xyz/anchor": "^0.31.1"
   ```

4. Install and use the version:
   ```bash
   avm install 0.31.1
   avm use 0.31.1
   npm install
   anchor build
   ```

### Known Bugs in Program

1. **Seed Mismatch Bug:**
   - `PlaceBet` uses: `[BET_SEED, player, vault.total_bets]`
   - `RequestRandomness` uses: `[BET_SEED, bet.player, bet.amount]`
   - `ConsumeRandomness` uses: `[BET_SEED, bet.player, bet.amount]`
   - This means `RequestRandomness` and `ConsumeRandomness` cannot find the bet account created by `PlaceBet`. 
   - **To fix:** Update `RequestRandomness` and `ConsumeRandomness` in `lib.rs` to use `vault.total_bets` instead of `bet.amount` in the seed.

2. **Direct Lamport Modification Bug:**
   - In `place_bet` (line 83), the program directly modifies lamports on the player account: `**ctx.accounts.player.to_account_info().try_borrow_mut_lamports()? -= amount;`
   - This fails because the program doesn't own the player account (it's owned by the System Program).
   - **To fix:** Use `anchor_lang::system_program::transfer` or `solana_program::system_instruction::transfer` to transfer SOL from player to vault instead of directly modifying lamports.
   - Same issue exists in `consume_randomness` (line 197-198) when transferring payout back to player.

## Troubleshooting

### Common Issues

1. **"Program account not found"**:
   - Run `anchor build` first
   - Make sure the program ID matches in `lib.rs` and `Anchor.toml`

2. **"Insufficient funds"**:
   - Get devnet SOL: `solana airdrop 2`
   - If rate limited, try: `solana airdrop 1` or use https://faucet.solana.com/
   - Check wallet balance: `solana balance`
   - For local testing, use `anchor test` which uses a local validator with unlimited SOL
   
3. **"Airdrop request failed - rate limit reached"**:
   - Devnet airdrops are rate-limited (max ~5 SOL per day per wallet)
   - Wait a few minutes and try again with a smaller amount: `solana airdrop 0.5`
   - Use the web faucet: https://faucet.solana.com/ (paste your wallet address)
   - Use `anchor test` for testing - it starts a local validator with unlimited SOL
   - Create a new keypair if you need more: `solana-keygen new -o ~/.config/solana/test-keypair.json`

4. **"Anchor version mismatch - Expected X, found Y"**:
   - This happens when the project expects a specific Anchor CLI version that doesn't match your installed version
   - **Solution 1 (Recommended):** Build with Cargo directly to bypass version check:
     ```bash
     cd programs/sol-casino
     cargo build-sbf
     ```
   - **Solution 2:** Install the required version: `avm install <version> && avm use <version>`
   - **Solution 3:** If the required version doesn't exist (e.g., 0.31.2), update the project dependencies:
     - Update `Cargo.toml`: change `anchor-lang` and `anchor-spl` to match available version
     - Update `package.json`: change `@coral-xyz/anchor` to match
     - Run `npm install` and try again
   - List available versions: `avm list`
   - Use latest: `avm install latest && avm use latest`
   
5. **"Dependency conflict" or "failed to select a version"**:
   - Check for incompatible dependencies (e.g., `switchboard-v2` with Anchor 0.30.1)
   - Remove or comment out unused dependencies in `Cargo.toml`
   - Ensure `anchor-lang` and `anchor-spl` versions match
   - For Anchor 0.30.1, use Solana 1.17.3+ (recommended: 1.18.17)

6. **"Anchor not found"**:
   - Install Anchor: `cargo install --git https://github.com/coral-xyz/anchor avm --locked --force`
   - Use avm: `avm install latest && avm use latest`

7. **"Type errors in tests"** or **"Cannot find module '../target/types/sol_casino'"**:
   - The TypeScript types need to be generated from the IDL
   - If `anchor build` is blocked, you need to generate types manually:
     ```bash
     # First, ensure the program is built
     cd programs/sol-casino
     cargo build-sbf
     
     # Then generate IDL (if anchor idl build works)
     anchor idl build
     
     # Generate TypeScript types
     anchor idl type target/idl/sol_casino.json > target/types/sol_casino.ts
     ```
   - If `anchor idl build` is also blocked, you may need to:
     - Reinitialize the project with a current Anchor version, OR
     - Manually create the IDL JSON file from your program code

8. **"anchor test blocked by version check"**:
   - This is a known issue when the expected Anchor CLI version doesn't exist (e.g., 0.31.2)
   - **Workaround:** Run tests manually:
     1. Start validator: `solana-test-validator --reset` (in separate terminal)
     2. Deploy: `solana program deploy target/deploy/sol_casino.so --url localhost`
     3. Run: `npx ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts`
   - **Better solution:** Reinitialize project with current Anchor version if possible

9. **"Port already in use"** (for Next.js):
   - Kill the process: `lsof -ti:3000 | xargs kill`
   - Or use a different port: `PORT=3001 npm run dev`

11. **"could not find `Cargo.toml`" when running `cargo build-sbf`**:
    - This error occurs when running `cargo build-sbf` from the wrong directory
    - **Solution:** Make sure you're in the program directory, not the workspace root:
      ```bash
      cd programs/sol-casino
      cargo build-sbf
      ```
    - The workspace root (`sol-casino/`) has a `Cargo.toml` for workspace management
    - The program directory (`sol-casino/programs/sol-casino/`) has the actual program `Cargo.toml`
    - Alternatively, use `anchor build` from the workspace root, which handles this automatically

12. **"no method named `source_file` found for struct `proc_macro2::Span`"** or **"Building IDL failed"**:
    - This error occurs when Anchor 0.30.1 is used with newer Rust toolchains
    - **Solution:** Update to Anchor 0.31.1 or later:
      ```bash
      # Update Anchor.toml
      [toolchain]
      anchor_version = "0.31.1"
      
      # Update Cargo.toml dependencies
      anchor-lang = "0.31.1"
      anchor-spl = "0.31.1"
      
      # Update package.json (if using TypeScript tests)
      "@coral-xyz/anchor": "^0.31.1"
      
      # Switch to the correct Anchor version
      avm use 0.31.1
      
      # Rebuild
      anchor build
      ```
    - Also add `anchor-spl/idl-build` to the `idl-build` feature in `Cargo.toml`:
      ```toml
      [features]
      idl-build = ["anchor-lang/idl-build", "anchor-spl/idl-build"]
      ```

13. **"SSL_ERROR_SYSCALL" or SSL connection errors when installing Solana**:
    - This error (`curl: (35) LibreSSL SSL_connect: SSL_ERROR_SYSCALL`) typically indicates network/firewall issues
    - **Solution 1 (Recommended):** Use the alternative Anza installation URL:
      ```bash
      sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
      ```
      (Anza is the new maintainer of Solana, and this URL often works when the original fails)
    
    - **Solution 2:** Check if Solana is already installed:
      ```bash
      solana --version
      ```
      If it shows a version, Solana is already installed and you may not need to reinstall.
    
    - **Solution 3:** Use Homebrew (if installed):
      ```bash
      brew install solana
      ```
      Note: Homebrew's Solana formula is deprecated but still works.
    
    - **Solution 4:** Manual installation from GitHub releases:
      1. Visit https://github.com/solana-labs/solana/releases/latest
      2. Download `solana-release-x86_64-apple-darwin.tar.bz2` (for Intel Mac) or `solana-release-aarch64-apple-darwin.tar.bz2` (for Apple Silicon)
      3. Extract: `tar jxf solana-release-*.tar.bz2`
      4. Add to PATH: `export PATH=$PWD/solana-release/bin:$PATH`
      5. Add to `~/.zshrc` for persistence
    
    - **Solution 5:** Check network/firewall settings:
      - Ensure you're not behind a restrictive firewall
      - Try from a different network (e.g., mobile hotspot)
      - Check if corporate VPN is blocking the connection
      - Verify DNS resolution: `ping release.solana.com`
    
    - **Solution 6:** Update Solana if already installed:
      ```bash
      # Check current version
      solana --version
      
      # Update using the alternative URL
      sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
      ```

---

## Quick Reference Commands

### Solana Program
```bash
# Build (if Anchor CLI version matches)
anchor build

# Build (if version mismatch - use Cargo directly)
cd programs/sol-casino
cargo build-sbf

# Test
anchor test

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Clean build artifacts
anchor clean
```

### Next.js Frontend
```bash
# Development
npm run dev

# Build
npm run build

# Production
npm start

# Lint
npm run lint
```

---

## Next Steps

1. Create test files in `tests/` directory
2. Write comprehensive integration tests
3. Test the frontend with a connected wallet
4. Deploy to devnet for end-to-end testing
5. Consider adding unit tests for complex logic
