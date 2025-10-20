# bluera-backend
Supabase backend for tracking onchain activity across Base. Aggregates wallet–token relationships, builds ecosystem/user heatmaps, leaderboards, and shareable aura data for Farcaster FIDs.

## Quick Start
```bash
npm run dev
npx trigger.dev@latest dev
```

## API Endpoints

### 1. POST `/api/aura_card`

**Purpose**: Creates a new `aura_card` row with wallet's all-time metrics and top-held whitelisted token ticker.

**External APIs**: Moralis `profitability/summary`, `wallets/{address}/tokens`

**DB Effect**: Inserts into `aura_card` table (no update/upsert). `network` and `created_at` use DB defaults.

#### Request Body
```json
{
  "walletAddress": "0x...",
  "chain": "base"
}
```

#### Response
```json
{
  "success": true,
  "wallet": "0x...",
  "chain": "base",
  "data": {
    "all_time_volume": 5278.57,
    "all_time_pnl": 630.90,
    "holder_tag": "DEGEN",
    "holder_tag_source": "whitelist∩holdings"
  },
  "debug": {
    "whitelistError": null,
    "top_holding_usd": 1234.56,
    "top_holding_address": "0x..."
  },
  "timestamp": "2025-01-19T..."
}
```

---

### 2. POST `/api/wallet-status-moralis`

**Purpose**: Aggregates wallet's swap volume by day/week/month over last 30 days (dedup by tx hash), fetches net worth, PnL (7d/30d), all-time volume; saves wallet-level status.

**External APIs**: Moralis (swaps, net worth, profitability)

**DB Effect**: Upsert into `wallets_status` table on `wallet_address`.

#### Request Body
```json
{
  "walletAddress": "0x...",
  "chain": "base",
  "fid": "optional-text",
  "maxPages": 100
}
```

#### Response
```json
{
  "success": true,
  "wallet": "0x...",
  "chain": "base",
  "counts": {
    "txs_day": 12,
    "txs_week": 78,
    "txs_month": 210
  },
  "volume_daily": 123.45,
  "volume_weekly": 2345.67,
  "volume_monthly": 8901.23,
  "all_time_volume": 5278.57,
  "db": {
    "success": true,
    "error": null
  },
  "timestamp": "2025-01-19T..."
}
```

---

### 3. POST `/api/wallet-token-status-moralis`

**Purpose**: For a wallet, per whitelisted token: fetch last X hours swaps (count/volume) and current USD holdings, then update/insert token-level status.

**External APIs**: Moralis `wallets/{address}/tokens`, `wallets/{address}/swaps`

**DB Effect**: Update `wallet_token_status` if row exists; otherwise insert.

#### Request Body
```json
{
  "walletAddress": "0x...",
  "hours": 24
}
```

#### Response
```json
{
  "success": true,
  "wallet": "0x...",
  "chain": "base",
  "hours": 24,
  "updated": 12,
  "processed": 20,
  "results": [
    {
      "token": "0x...",
      "count": 5,
      "volume": 321.0,
      "holding_usd": 42.1,
      "updated": true
    }
  ],
  "timestamp": "2025-01-19T..."
}
```

---

### 4. POST `/api/dexscreenr`

**Purpose**: Loads `whitelisted_tokens`, batches calls to Dexscreener, aggregates 24h volume and tx counts per token across pairs, updates existing tokens and inserts new ones. Computes `total_volume_changing_rate` vs previous value.

**External APIs**: Dexscreener `/tokens/v1/{chain}/{addr1,addr2,...}`

**DB Effect**: Update existing rows in `whitelisted_tokens`, insert missing tokens.

#### Request Body
```json
{
  "chain": "base",
  "batchSize": 20,
  "debugAddress": "0xoptional"
}
```

#### Response
```json
{
  "success": true,
  "updated": 42,
  "chain": "base",
  "timestamp": "2025-01-19T...",
  "debug": {
    "token": "0x...",
    "inWhitelist": true,
    "prevVolume": 1000.0,
    "aggregatedVolume": 1200.0,
    "updatePath": "update",
    "computedRate": 0.2
  }
}
```

---

## Environment Variables Required
- `MORALIS_API_KEY` - Required for Moralis API calls
- `SUPABASE_URL` - Supabase project URL  
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `NEXT_PUBLIC_BASE_URL` - Optional, for internal API calls (defaults to localhost:3000)

## Smart Contract Integration

### Claim System

**Purpose**: ERC20 token claim system for eligible users based on Supabase database.

#### Contract: `BlueraClaimContract`
- **File**: `web3-backend/contracts/claim.sol`
- **ABI**: `web3-backend/ABI/claimABI.json`
- **Network**: Base
- **Deployed Address**: `0xb1300cBc360c04c377C4b37FD9bA132b08969a60`

#### Database Integration
**Table**: `claimable_addresses`
```sql
CREATE TABLE public.claimable_addresses (
  wallet_address text NOT NULL PRIMARY KEY,
  claimable_right boolean NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
```

#### Workflow
1. **Eligibility**: User added to `claimable_addresses` table
2. **Amount Setting**: Contract owner calls `setClaimable(user, amount)` 
3. **Claim**: User calls `claim()` to withdraw their tokens

#### Key Functions
- `setClaimable(address user, uint256 amount)` - Owner sets claimable amount
- `setClaimableBatch(address[] users, uint256[] amounts)` - Batch set amounts
- `claim()` - User claims their tokens
- `claimable(address user)` - View claimable balance

#### Requirements
- Contract owner private key for `setClaimable` calls
- ERC20 reward token deployed and funded
- Supabase trigger/webhook to call contract when new users added

#### Integration Points
- **Supabase** → Contract: New user triggers `setClaimable`
- **Frontend** → Contract: User calls `claim()` function
- **Backend** → Contract: Owner manages claimable amounts

---

### AuraCard NFT System

**Purpose**: ERC721 NFT minting system with on-chain wallet data storage and USDC payment integration.

#### Contract: `AuraCardNFTContract`
- **File**: `web3-backend/contracts/AuraCard.sol`
- **ABI**: `web3-backend/ABI/auracardABI.json` (empty - needs generation)
- **Network**: Base
- **Deployed Proxy Address**: `0x1e885b12D233dFDc677eCd0CC62A0bad5F69ebAc`

#### Database Integration
**Table**: `aura_card` (existing)
```sql
-- Uses existing aura_card table with:
-- wallet_address, all_time_volume, all_time_pnl, holder_tag, network, created_at, minted
```

#### Workflow
1. **Payment Setup**: User approves USDC to contract
2. **Mint**: User calls `mint()` function (pays USDC)
3. **Data Sync**: Backend calls `setTokenData()` with Supabase data
4. **NFT Ready**: Token contains on-chain wallet metrics

#### Key Functions
- `mint()` - User mints NFT (requires USDC approval)
- `setTokenData(tokenId, network, holderTag, allTimeVolume, allTimePnl, walletAge, dateInterval)` - Owner sets wallet data
- `getTokenData(tokenId)` - View token's wallet data
- `getTokenDataPaginated(startId, limit)` - Batch view token data
- `setFirstMintUsdCents(cents)` - Owner sets first mint price
- `setSubsequentMintUsdCents(cents)` - Owner sets subsequent mint price

#### Pricing
- **First Mint**: 1¢ (10,000 USDC units)
- **Subsequent Mints**: 10¢ (100,000 USDC units)
- **Payment Token**: USDC (6 decimals)
- **Payment Collector**: Owner-configurable address

#### TokenData Structure
```solidity
struct TokenData {
    string  network;        // "base"
    string  holderTag;      // From Supabase aura_card.holder_tag
    uint256 allTimeVolume;  // From Supabase aura_card.all_time_volume
    uint256 allTimePnl;     // From Supabase aura_card.all_time_pnl
    uint256 walletAge;      // Calculated wallet age
    uint256 dateInterval;   // Data collection period
}
```

#### Integration Points
- **Frontend** → Contract: User approves USDC + calls `mint()`
- **Backend** → Supabase: Query `aura_card` table for wallet data
- **Backend** → Contract: Call `setTokenData()` after mint
- **Frontend** → Contract: View NFT metadata and wallet data

#### Requirements
- USDC contract deployed and funded by users
- Contract owner private key for `setTokenData` calls
- Supabase integration to fetch wallet metrics
- Backend service to sync data after mint

#### Events
- `Minted(address minter, uint256 tokenId, uint256 amount, bool firstMint)`
- `TokenDataSet(uint256 tokenId, string network, string holderTag, uint256 allTimeVolume, uint256 allTimePnl, uint256 walletAge, uint256 dateInterval)`
- `PricesUpdated(uint256 firstMintCents, uint256 subsequentMintCents)`

---

## Notes
- **Auth**: Endpoints are not authenticated by default. Add protection if exposing publicly.
- **Rate Limits**: `maxPages` parameters control API call limits to prevent rate limit issues.
- **Chain**: Most endpoints default to `base` chain but can be overridden.
- **Background Jobs**: Use `npx trigger.dev@latest dev` to run scheduled tasks for wallet status updates and token heatmap refreshes.
