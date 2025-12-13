# RPC Connection Troubleshooting Guide

## Problem: "Failed to fetch" Error

### Root Cause Analysis

The error `failed to get recent blockhash: TypeError: Failed to fetch` occurs **before** any transaction is sent. This indicates an RPC/network issue, not a program logic error.

### Why "Failed to fetch" Happens

1. **Public RPC Rate Limiting**
   - `https://api.devnet.solana.com` is a public endpoint
   - Has strict rate limits (often 2-4 requests per second)
   - Can be temporarily unavailable during high traffic

2. **CORS Restrictions**
   - Browser security blocks cross-origin requests
   - Public RPC endpoints should allow CORS, but may fail intermittently

3. **Network Connectivity**
   - Firewall blocking requests
   - VPN interference
   - ISP blocking

4. **Mixed Content (HTTPS/HTTP)**
   - If the UI is served over HTTPS, HTTP RPC endpoints are blocked
   - Solution: Always use HTTPS for RPC endpoints in production

## Solutions

### Solution 1: Use a Dedicated RPC Provider (Recommended)

Replace the public endpoint with a free tier from:
- **Helius**: https://www.helius.dev/ (Free tier: 100k credits/month)
- **QuickNode**: https://www.quicknode.com/ (Free tier available)
- **Alchemy**: https://www.alchemy.com/ (Free tier available)

**Update `src/solana.ts`:**
```typescript
export const RPC_ENDPOINTS = {
  devnet: 'https://devnet.helius-rpc.com/?api-key=YOUR_API_KEY',
  // OR
  // devnet: 'https://YOUR-ENDPOINT.quicknode.com/YOUR_TOKEN',
  localnet: 'http://localhost:8899',
};
```

### Solution 2: Use Alternative Public Endpoints

Try these public alternatives:
```typescript
export const RPC_ENDPOINTS = {
  devnet: 'https://api.devnet.solana.com', // Primary
  // Alternatives (uncomment to try):
  // devnet: 'https://solana-devnet.g.alchemy.com/v2/YOUR_KEY',
  // devnet: 'https://rpc.ankr.com/solana_devnet',
  localnet: 'http://localhost:8899',
};
```

### Solution 3: Add Retry Logic (Already Implemented)

The UI now includes:
- ✅ RPC health checks
- ✅ Connection status indicator
- ✅ Better error messages
- ✅ Automatic retry on health check

### Solution 4: Use Localnet for Development

For local testing with unlimited SOL:
1. Start local validator: `solana-test-validator --reset`
2. Change cluster in `src/solana.ts`: `export const CLUSTER = 'localnet'`
3. Deploy program: `anchor deploy --provider.cluster localnet`

## Admin/Init Logic

### Who Can Initialize?

**Answer**: The wallet that calls `init_game` becomes the admin. There's no pre-set admin authority.

- The first wallet to successfully call `init_game` becomes the admin
- The `admin` field in `GameConfig` is set to `ctx.accounts.admin.key()` (the signer)
- Any wallet can initialize, but only once (account already exists error on second attempt)

### Error if Wrong Wallet?

If you try to initialize again with a different wallet after the game is already initialized, you'll get:
- **Error**: "Account already in use" or "Account already initialized"
- This is because the `game_config` PDA already exists

## Current Implementation Status

✅ **Fixed Issues:**
- Added RPC health check function
- Added connection status indicator in UI
- Improved error messages for RPC failures
- Disabled buttons when RPC is unhealthy
- Added automatic health check on mount and every 30 seconds

✅ **Error Handling:**
- All RPC calls wrapped in try/catch
- Human-readable error extraction
- Clear error messages in logs panel

## Testing RPC Connection

The UI now shows:
1. **RPC Status** indicator (green = healthy, red = failed)
2. **Error details** if connection fails
3. **Automatic retry** every 30 seconds

If RPC status shows "❌ Connection Failed", check:
1. Internet connection
2. RPC endpoint URL is correct
3. Try a different RPC provider
4. Check browser console for CORS errors

## Quick Fix Checklist

- [ ] Check RPC Status indicator in UI
- [ ] Verify internet connection
- [ ] Try refreshing the page
- [ ] Switch to a dedicated RPC provider (Helius/QuickNode)
- [ ] Check browser console for detailed errors
- [ ] For local testing, use localnet with `solana-test-validator`
