# SOL Casino UI

Minimal Vite + React + TypeScript UI for the SOL Casino Anchor program.

## Setup

1. **Add logo image** (optional):
   - Place your logo image in `public/logo.png`
   - Supported formats: PNG, JPG, SVG
   - Recommended: PNG with transparency, max 800px width

2. Install dependencies:
```bash
pnpm i
```

3. Start development server:
```bash
pnpm dev
```

The app will be available at `http://localhost:3000`

## Configuration

### Switch between devnet and localnet

Edit `src/solana.ts` and change the `CLUSTER` constant:

```typescript
export const CLUSTER: 'devnet' | 'localnet' = 'devnet'; // or 'localnet'
```

## Features

- **Wallet Connection**: Connect with Phantom or Solflare
- **Initialize Game**: Admin function to set up game parameters
- **Place Bet**: Place Over/Under bets on dice rolls
- **Logs Panel**: View transaction signatures and errors

## Project Structure

```
ui/
├── public/
│   └── logo.png          # Logo image (place your logo here)
├── src/
│   ├── main.tsx          # Entry point with wallet providers
│   ├── App.tsx           # Main app component
│   ├── solana.ts         # Connection, provider, and program setup
│   ├── pda.ts            # PDA derivation helpers
│   ├── idl.json          # Program IDL (copied from target/idl/)
│   └── index.css         # Basic styles
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## Notes

- All RPC calls are wrapped in try/catch with error extraction
- Buttons are disabled when wallet is not connected
- Inputs are validated before sending transactions
- Transactions are confirmed with `confirmed` commitment
- PDAs are derived deterministically from known seeds
