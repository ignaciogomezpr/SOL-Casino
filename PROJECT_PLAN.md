# $SOL Casino - Dice Roll Game
## Project Plan: 4 Sprints

---

## **Sprint 1: Foundation & Core Program Structure**
**Goal:** Set up Anchor project, define accounts, and implement basic game initialization.

### Commits:
1. **Initialize Anchor project structure**
   - Create Anchor workspace with `anchor init`
   - Set up basic program structure
   - Configure Anchor.toml for devnet

2. **Define core accounts (GameConfig, Vault, Bet)**
   - Create account structs in lib.rs
   - Define PDAs and seeds
   - Add account validation constraints

3. **Implement `init_game` instruction**
   - Initialize GameConfig with house edge, min/max bets
   - Create and fund vault PDA
   - Add admin controls and validation

4. **Add basic error handling and constraints**
   - Define custom error codes
   - Add account size checks
   - Implement access control

---

## **Sprint 2: Betting Logic & VRF Integration**
**Goal:** Implement bet placement and integrate Switchboard VRF for randomness.

### Commits:
5. **Implement `place_bet` instruction**
   - Accept player bet (Over/Under/Exactly 7)
   - Transfer SOL to vault PDA
   - Create Bet account with bet details
   - Validate bet amount against limits

6. **Integrate Switchboard VRF**
   - Add Switchboard dependencies
   - Request randomness from VRF oracle
   - Store VRF request in Bet account
   - Handle VRF callback structure

7. **Implement `consume_randomness` instruction**
   - Receive VRF proof and verify
   - Calculate dice roll (2-12) from random value
   - Determine win/loss based on bet type
   - Calculate payout with house edge

8. **Add bet settlement and payout logic**
   - Transfer winnings to player
   - Update vault balance
   - Close Bet account after settlement
   - Handle edge cases (insufficient funds, etc.)

---

## **Sprint 3: Frontend dApp & Wallet Integration**
**Goal:** Build React frontend with wallet connection and betting interface.

### Commits:
9. **Set up Next.js project with Solana dependencies**
   - Initialize Next.js with TypeScript
   - Install @solana/web3.js, @solana/wallet-adapter
   - Configure wallet adapter providers

10. **Create wallet connection UI**
    - Wallet adapter button component
    - Support Phantom, Solflare, Backpack
    - Display connected wallet address and balance

11. **Build betting interface**
    - Bet type selector (Over/Under/Exactly 7)
    - Amount input with validation
    - Display odds and potential payout
    - Place bet button with transaction handling

12. **Add transaction status tracking**
    - Show transaction signatures
    - Display bet status (pending → randomness → settled)
    - Link to Solana Explorer
    - Show win/loss results and payouts

---

## **Sprint 4: Testing, Polish & Security**
**Goal:** Comprehensive testing, security audits, and final features.

### Commits:
13. **Write Anchor integration tests**
    - Test init_game with various configs
    - Test place_bet with valid/invalid inputs
    - Test randomness consumption and payouts
    - Test edge cases (max exposure, insufficient funds)

14. **Add admin controls and pause functionality**
    - Implement pause_bets instruction
    - Add admin-only access controls
    - Update config instruction for adjustments

15. **Frontend: Add game history and stats**
    - Display recent bets and results
    - Show player win/loss statistics
    - Add loading states and error handling

16. **Final security audit and documentation**
    - Review all account constraints
    - Verify PDA security
    - Add comprehensive README
    - Deploy to devnet and test end-to-end

---

## **Tech Stack Summary**
- **On-Chain:** Rust + Anchor Framework
- **VRF:** Switchboard VRF Oracle
- **Frontend:** Next.js + React + TypeScript
- **Wallets:** Solana Wallet Adapter
- **Testing:** Anchor tests + TypeScript integration tests
- **Network:** Solana Devnet

---

## **Key Features**
✅ Provably fair randomness via VRF  
✅ Secure fund management with PDAs  
✅ House edge (2%) built into payouts  
✅ Max exposure limits per bet  
✅ Admin controls for game management  
✅ Modern React dApp with wallet integration  

---

**Ready to start Sprint 1!** 🚀

