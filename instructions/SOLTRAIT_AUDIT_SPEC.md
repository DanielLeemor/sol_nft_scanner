# 🔐 PROJECT SPEC: SolTrait Audit Blink (2026)

> **Version:** 2.0  
> **Last Updated:** January 2026  
> **Status:** Ready for Development

---

## 1. Project Overview

A 2-stage Solana Action (Blink) that allows users to audit their NFT portfolio's hidden value.

| Stage | Name | Cost | Description |
|-------|------|------|-------------|
| 1 | **Scan** | Free | User connects wallet, views collections with NFT counts, selects which to audit |
| 2 | **Audit** | Paid | User pays based on NFT count; receives detailed CSV of last sales & rare trait floors |

---

## 2. Tech Stack

| Component | Service | Purpose |
|-----------|---------|---------|
| Deployment | Netlify | Next.js App Router + Serverless Functions |
| Database | Supabase | PostgreSQL for signatures, caching, rate limiting |
| Blockchain Data | Helius | DAS API for wallet scanning, NFT metadata, transaction history |
| Market Data | Magic Eden | Listings & collection stats (for trait floor calculation) |
| Interaction | Solana Actions SDK | Blink unfurling & transaction signing |

---

## 3. Pricing Logic

The backend calculates price dynamically before generating the payment transaction.

### Formula

```
if (nftCount <= 20) {
  price = 0.02 SOL
} else {
  price = 0.02 + (Math.ceil((nftCount - 20) / 100) * 0.05) SOL
}
```

### Examples

| NFT Count | Calculation | Price |
|-----------|-------------|-------|
| 1–20 | Base tier | 0.02 SOL |
| 21–120 | 0.02 + 0.05 | 0.07 SOL |
| 121–220 | 0.02 + 0.10 | 0.12 SOL |
| 221–320 | 0.02 + 0.15 | 0.17 SOL |

---

## 4. User Flow

### Stage 1: Collection Selection (Free)

1. User provides wallet address (input or wallet connect)
2. Backend calls Helius DAS API to fetch all NFTs
3. User sees checkbox list of collections with NFT counts:
   ```
   ☐ DeGods (12 NFTs)
   ☐ Mad Lads (5 NFTs)
   ☐ Tensorians (23 NFTs)
   ```
4. User selects collections to audit
5. UI displays calculated price based on total selected NFTs

### Stage 2: Payment & Audit

1. User confirms selection
2. Backend generates payment transaction
3. User signs transaction in wallet
4. Payment confirms on-chain
5. Backend verifies payment, fetches SimpleHash data
6. CSV generated and download link provided

---

## 5. Database Schema

Run in Supabase SQL Editor:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Processed signatures (prevents double-fulfillment)
CREATE TABLE processed_signatures (
    signature TEXT PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    amount_paid NUMERIC NOT NULL,
    nft_count INTEGER NOT NULL,
    selected_collections JSONB NOT NULL,
    report_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit reports (cached for 24h)
CREATE TABLE audit_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_address TEXT NOT NULL,
    report_json JSONB NOT NULL,
    status TEXT DEFAULT 'complete', -- 'complete', 'partial', 'failed'
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rate limiting for Stage 1 scans
CREATE TABLE wallet_scans (
    wallet_address TEXT PRIMARY KEY,
    last_scan_at TIMESTAMPTZ DEFAULT NOW(),
    scan_count INTEGER DEFAULT 1
);

-- Index for faster lookups
CREATE INDEX idx_reports_wallet ON audit_reports(wallet_address);
CREATE INDEX idx_reports_created ON audit_reports(created_at);

-- Auto-cleanup: Delete reports older than 24h (run via Supabase cron)
-- SELECT cron.schedule('cleanup-old-reports', '0 * * * *', 
--   $$DELETE FROM audit_reports WHERE created_at < NOW() - INTERVAL '24 hours'$$);
```

---

## 6. API Endpoints

### 6.1 GET `/api/actions/audit`

**Purpose:** Initial scan - returns collection list for selection

**Query Parameters:**
- `wallet` (required): Solana wallet address

**Response:** `ActionGetResponse` with select parameter

```json
{
  "type": "action",
  "icon": "https://yourdomain.com/icon.png",
  "title": "SolTrait NFT Audit",
  "description": "Select collections to audit for hidden value",
  "label": "Scan Wallet",
  "links": {
    "actions": [
      {
        "type": "transaction",
        "label": "Audit Selected",
        "href": "/api/actions/audit?wallet={wallet}",
        "parameters": [
          {
            "type": "select",
            "name": "collections",
            "label": "Select Collections",
            "required": true,
            "options": [
              { "label": "DeGods (12 NFTs)", "value": "degods:12" },
              { "label": "Mad Lads (5 NFTs)", "value": "madlads:5" }
            ]
          }
        ]
      }
    ]
  }
}
```

### 6.2 POST `/api/actions/audit`

**Purpose:** Generate payment transaction

**Request Body:**
```json
{
  "account": "USER_WALLET_ADDRESS",
  "data": {
    "collections": ["degods:12", "madlads:5"]
  }
}
```

**Response:** `ActionPostResponse` with transaction

```json
{
  "type": "transaction",
  "transaction": "BASE64_ENCODED_VERSIONED_TRANSACTION",
  "message": "Pay 0.02 SOL to audit 17 NFTs",
  "links": {
    "next": {
      "type": "post",
      "href": "/api/actions/reveal"
    }
  }
}
```

### 6.3 POST `/api/actions/reveal`

**Purpose:** Verify payment and return audit results

**Request Body:**
```json
{
  "account": "USER_WALLET_ADDRESS",
  "signature": "TRANSACTION_SIGNATURE"
}
```

**Response (Success):**
```json
{
  "type": "completed",
  "title": "Audit Complete!",
  "description": "Found 3 NFTs with traits above floor",
  "icon": "https://yourdomain.com/success.png",
  "links": {
    "actions": [
      {
        "type": "external-link",
        "label": "Download CSV",
        "href": "https://yourdomain.com/api/download?id=REPORT_UUID"
      }
    ]
  }
}
```

---

## 7. Data Sources & API Flow

### Overview

| Service | What It Provides | Cost |
|---------|------------------|------|
| **Helius** | Wallet scanning, NFT metadata, traits, collections, transaction history | $49/mo (Developer) |
| **Magic Eden** | Active listings + prices (you calculate trait floors) | Free (120 QPM default) |

### Data Source Per CSV Column

| CSV Column | Source | API Call |
|------------|--------|----------|
| `wallet_address` | User input | — |
| `collection_name` | Helius | `getAssetsByOwner` |
| `collection_id` | Helius | `getAssetsByOwner` |
| `nft_id` | Helius | `getAssetsByOwner` |
| `nft_name` | Helius | `getAssetsByOwner` |
| `floor_price_sol` | Magic Eden | `/collections/:symbol/stats` |
| `zero_price_trait_count` | **Calculated** | From Magic Eden listings |
| `highest_trait_price_sol` | **Calculated** | From Magic Eden listings |
| `highest_trait_name` | **Calculated** | From Magic Eden listings |
| `last_tx_date` | Helius | Enhanced Transactions API |
| `last_tx_price_sol` | Helius | Enhanced Transactions API |
| `last_tx_from` | Helius | Enhanced Transactions API |
| `last_tx_to` | Helius | Enhanced Transactions API |

### Stage 1: Wallet Scan (Helius)

```typescript
// Fetch all NFTs owned by wallet
const response = await fetch(HELIUS_RPC_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 'scan',
    method: 'getAssetsByOwner',
    params: {
      ownerAddress: walletAddress,
      displayOptions: { showCollectionMetadata: true }
    }
  })
});

const { result } = await response.json();

// Group NFTs by collection
const collections = {};
result.items.forEach(nft => {
  const collectionId = nft.grouping?.[0]?.group_value || 'Unknown';
  const collectionName = nft.grouping?.[0]?.collection_metadata?.name || collectionId;
  
  if (!collections[collectionId]) {
    collections[collectionId] = { 
      name: collectionName, 
      symbol: collectionName.toLowerCase().replace(/\s+/g, '_'),
      count: 0, 
      nfts: [] 
    };
  }
  collections[collectionId].count++;
  collections[collectionId].nfts.push(nft);
});

// Returns data for checkbox UI:
// ☐ DeGods (12 NFTs)
// ☐ Mad Lads (5 NFTs)
```

### Stage 2: Trait Floor Calculation (Magic Eden)

**Important:** Magic Eden does NOT provide trait floors directly. You must calculate them from listings.

```typescript
// Step 1: Get all listings for a collection
const listingsResponse = await fetch(
  `https://api-mainnet.magiceden.dev/v2/collections/${collectionSymbol}/listings?limit=500`
);
const listings = await listingsResponse.json();

// Step 2: Get collection floor for comparison
const statsResponse = await fetch(
  `https://api-mainnet.magiceden.dev/v2/collections/${collectionSymbol}/stats`
);
const stats = await statsResponse.json();
const collectionFloor = stats.floorPrice / 1e9; // Convert lamports to SOL

// Step 3: Build trait floor map from listings
const traitFloors = {};

listings.forEach(listing => {
  const price = listing.price; // Already in SOL
  
  listing.attributes?.forEach(attr => {
    const traitKey = `${attr.trait_type}: ${attr.value}`;
    
    if (!traitFloors[traitKey] || price < traitFloors[traitKey]) {
      traitFloors[traitKey] = price;
    }
  });
});

// Example result:
// {
//   "Background: Gold": 120.0,
//   "Eyes: Laser": 48.2,
//   "Hat: Basic": 45.5
// }

// Step 4: For each user's NFT, find highest trait and zero-price count
function analyzeNftTraits(nft, traitFloors) {
  let highestTraitPrice = 0;
  let highestTraitName = "No traits found";
  let zeroCount = 0;

  nft.attributes?.forEach(attr => {
    const traitKey = `${attr.trait_type}: ${attr.value}`;
    const traitPrice = traitFloors[traitKey];

    if (traitPrice === undefined) {
      zeroCount++; // No listings for this trait
    } else if (traitPrice > highestTraitPrice) {
      highestTraitPrice = traitPrice;
      highestTraitName = traitKey;
    }
  });

  return { highestTraitPrice, highestTraitName, zeroCount };
}
```

### Stage 3: Transaction History (Helius)

```typescript
// Get parsed transaction history for an NFT
const txResponse = await fetch(
  `https://api.helius.xyz/v0/addresses/${nftMintAddress}/transactions?api-key=${HELIUS_API_KEY}&type=NFT_SALE`
);
const transactions = await txResponse.json();

// Find most recent sale
const lastSale = transactions[0]; // Already sorted by most recent

// Helius returns parsed data:
// {
//   "type": "NFT_SALE",
//   "timestamp": 1705312200,
//   "source": "MAGIC_EDEN",
//   "events": {
//     "nft": {
//       "seller": "8bF...sender",
//       "buyer": "7xK...abc", 
//       "amount": 52300000000 // lamports
//     }
//   }
// }

const lastTx = {
  date: new Date(lastSale.timestamp * 1000).toISOString(),
  price: lastSale.events.nft.amount / 1e9,
  from: lastSale.events.nft.seller,
  to: lastSale.events.nft.buyer
};
```

---

## 8. CSV Output Format

### Columns

| Column | Description | Example |
|--------|-------------|---------|
| `wallet_address` | Owner wallet | `7xK...abc` |
| `collection_name` | Collection name | `DeGods` |
| `collection_id` | On-chain collection ID | `DGod...xyz` |
| `nft_id` | Token mint address | `NFT1...def` |
| `nft_name` | NFT name/number | `DeGod #1234` |
| `floor_price_sol` | Collection floor | `45.5` |
| `zero_price_trait_count` | Traits with 0 SOL listings | `2` |
| `highest_trait_price_sol` | Top trait floor price | `120.0` |
| `highest_trait_name` | Name of highest trait | `Background: Gold` |
| `last_tx_date` | Last sale date | `2026-01-15T14:30:00Z` |
| `last_tx_price_sol` | Last sale price | `52.3` |
| `last_tx_from` | Seller wallet | `8bF...sender` |
| `last_tx_to` | Buyer wallet | `7xK...abc` |

### Sample CSV

```csv
wallet_address,collection_name,collection_id,nft_id,nft_name,floor_price_sol,zero_price_trait_count,highest_trait_price_sol,highest_trait_name,last_tx_date,last_tx_price_sol,last_tx_from,last_tx_to
7xKp...abc,DeGods,DGod...xyz,NFT1...def,DeGod #1234,45.5,2,120.0,Background: Gold,2026-01-15T14:30:00Z,52.3,8bF...sender,7xKp...abc
7xKp...abc,DeGods,DGod...xyz,NFT2...ghi,DeGod #5678,45.5,0,48.2,Eyes: Laser,2026-01-10T09:15:00Z,46.1,9cG...seller,7xKp...abc
7xKp...abc,Mad Lads,MLad...uvw,NFT3...jkl,Mad Lad #420,12.3,1,15.8,Hat: Crown,2026-01-12T18:45:00Z,13.0,2dH...trader,7xKp...abc
7xKp...abc,Mad Lads,MLad...uvw,NFT4...mno,Mad Lad #069,12.3,0,0,No traits found,2026-01-08T11:20:00Z,12.5,3eI...buyer,7xKp...abc
```

### Edge Case: No Valuable Traits

If an NFT has no traits with floor prices above the collection floor:
- `highest_trait_price_sol` = `0`
- `highest_trait_name` = `No traits found`

The CSV is always delivered regardless of whether valuable traits are found — the user is paying for the audit data, not guaranteed alpha.

---

## 9. Security Protocols

### 9.1 Server-Side Only

All sensitive operations happen in Netlify Functions:
- ❌ No API keys in frontend code
- ❌ No price calculation in frontend
- ✅ Helius API calls server-side only
- ✅ Magic Eden API calls server-side only

### 9.2 Signature Verification (Required Before Fulfillment)

```typescript
async function verifyPayment(signature: string, expectedAmount: number, treasury: string): Promise<boolean> {
  // 1. Check if signature already used
  const { data: existing } = await supabase
    .from('processed_signatures')
    .select('signature')
    .eq('signature', signature)
    .single();
  
  if (existing) {
    throw new Error('Signature already processed');
  }

  // 2. Verify transaction on-chain
  const connection = new Connection(process.env.HELIUS_RPC);
  const tx = await connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0
  });

  if (!tx) {
    throw new Error('Transaction not found');
  }

  // 3. Verify destination is treasury
  // 4. Verify amount matches expected
  // 5. Verify transaction succeeded
  
  return true;
}
```

### 9.3 Rate Limiting (Stage 1)

Prevent scan abuse with wallet-based cooldown:

```typescript
async function checkRateLimit(wallet: string): Promise<boolean> {
  const COOLDOWN_MINUTES = 5;
  
  const { data } = await supabase
    .from('wallet_scans')
    .select('last_scan_at')
    .eq('wallet_address', wallet)
    .single();

  if (data) {
    const lastScan = new Date(data.last_scan_at);
    const cooldownEnd = new Date(lastScan.getTime() + COOLDOWN_MINUTES * 60 * 1000);
    
    if (new Date() < cooldownEnd) {
      throw new Error(`Please wait ${COOLDOWN_MINUTES} minutes between scans`);
    }
  }

  // Upsert scan record
  await supabase
    .from('wallet_scans')
    .upsert({ 
      wallet_address: wallet, 
      last_scan_at: new Date().toISOString(),
      scan_count: data ? data.scan_count + 1 : 1
    });

  return true;
}
```

### 9.4 Blink Registration

Register domain with Dialect Actions Registry for X/Twitter unfurling:
- URL: https://dial.to/register
- Verify domain ownership
- Submit actions.json location

---

## 10. Error Handling

| Scenario | Behavior |
|----------|----------|
| **Helius API fails (Stage 1)** | Return error message, user can retry (free) |
| **Magic Eden API fails (Stage 2)** | Store partial results with `status: 'partial'`, provide what's available, log for manual review |
| **Payment confirms, reveal times out** | User can re-call `/reveal` with same signature — return cached report via `report_id` link |
| **Invalid wallet address** | Return 400 with clear error message |
| **No NFTs found** | Return friendly message, no charge |
| **Signature verification fails** | Return 401, do not process |

### Retry Logic for External APIs

```typescript
async function fetchWithRetry<T>(
  fn: () => Promise<T>, 
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(r => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw new Error('Max retries exceeded');
}
```

---

## 11. Required Files

### 11.1 `/.well-known/actions.json`

```json
{
  "rules": [
    {
      "pathPattern": "/api/actions/audit",
      "apiPath": "/api/actions/audit"
    },
    {
      "pathPattern": "/api/actions/reveal",
      "apiPath": "/api/actions/reveal"
    }
  ]
}
```

### 11.2 CORS Headers (All API Routes)

```typescript
export const ACTIONS_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept-Encoding",
  "Access-Control-Expose-Headers": "X-Action-Version, X-Blockchain-Ids",
  "Content-Type": "application/json",
};

// Apply to all action routes
export async function OPTIONS() {
  return new Response(null, { headers: ACTIONS_CORS_HEADERS });
}
```

### 11.3 Environment Variables (`.env.local`)

```bash
# Helius - Blockchain Data & Wallet Scanning
HELIUS_API_KEY=your_helius_api_key
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY

# Magic Eden - Market Data (optional, only if you get an API key)
MAGIC_EDEN_API_KEY=your_magic_eden_api_key

# Supabase - Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Treasury
TREASURY_WALLET=your_treasury_wallet_address

# App
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

---

## 12. Development Phases

### Phase 1: Infrastructure Setup
- [ ] Create Next.js project with App Router
- [ ] Configure Netlify deployment
- [ ] Set up Supabase database with schema
- [ ] Configure environment variables
- [ ] Create `actions.json` manifest
- [ ] Build landing page (see Section 15)

### Phase 2: Stage 1 - Scan Endpoint
- [ ] Implement `GET /api/actions/audit`
- [ ] Integrate Helius DAS API
- [ ] Build collection aggregation logic
- [ ] Add rate limiting
- [ ] Test ActionGetResponse format

### Phase 3: Stage 2 - Payment Endpoint
- [ ] Implement `POST /api/actions/audit`
- [ ] Build pricing calculation
- [ ] Generate VersionedTransaction
- [ ] Configure `links.next` for reveal

### Phase 4: Stage 3 - Reveal Endpoint
- [ ] Implement `POST /api/actions/reveal`
- [ ] Build signature verification
- [ ] Integrate Magic Eden API for listings
- [ ] Build trait floor calculation logic
- [ ] Integrate Helius transaction history
- [ ] Generate CSV report
- [ ] Implement caching

### Phase 5: Testing & Launch
- [ ] End-to-end testing on devnet
- [ ] Mainnet testing with small amounts
- [ ] Register with Dialect Actions Registry (https://dial.to)
- [ ] Monitor and iterate

---

## 15. Landing Page

A simple landing page at `solnftscanner.com` to establish trust.

### Required Sections

1. **Hero** — One-liner: "Discover hidden value in your Solana NFT portfolio"
2. **How it works** — 3 steps: Connect → Select → Get Report
3. **Pricing** — Clear breakdown of tiers
4. **Sample Report** — Screenshot or table showing CSV output
5. **FAQ** — Common questions
6. **Footer** — Twitter link (@DLeemor), contact info

### Pricing Display

```
┌─────────────────────────────────────────────┐
│  NFTs          │  Price                     │
├─────────────────────────────────────────────┤
│  1-20          │  0.02 SOL                  │
│  21-120        │  0.07 SOL                  │
│  121-220       │  0.12 SOL                  │
│  221+          │  +0.05 SOL per 100 NFTs    │
└─────────────────────────────────────────────┘
```

### FAQ Content

**Q: What data do I get?**
A: A CSV with floor prices, trait values, last sale prices, and transaction history for each NFT.

**Q: Is my wallet safe?**
A: Yes. We only request a payment transaction — we never have access to your NFTs or wallet.

**Q: How long does it take?**
A: Usually under 30 seconds after payment confirms.

**Q: What if I have issues?**
A: DM @DLeemor on Twitter for support.

---

## 16. Dialect Registration (dial.to)

Register your Blink after deployment is complete and tested.

### Steps

1. Go to https://dial.to
2. Connect wallet
3. Register domain: `solnftscanner.com`
4. Verify ownership (DNS or file verification)
5. Submit for review

### Requirements

- Working `actions.json` at `https://solnftscanner.com/.well-known/actions.json`
- HTTPS enabled (automatic with Netlify)
- Functional Blink endpoints

### After Approval

- Your Blink unfurls on Twitter/X
- Shows "verified" indicator
- Users can interact directly in-app

---

## 13. Service Costs

| Service | Tier | Test Cost | Production Cost |
|---------|------|-----------|-----------------|
| Netlify | Free / Pro | $0 | $0–$20/mo |
| Supabase | Free | $0 | $0 (free tier sufficient) |
| Helius | Developer | $0 | $49/mo |
| Magic Eden | Free (120 QPM) | $0 | $0 (or contact for higher limits) |
| **Total** | | **$0** | **~$49–$69/mo** |

---

## 14. Useful Links

- [Solana Actions Spec](https://solana.com/docs/advanced/actions)
- [Helius DAS API Docs](https://docs.helius.dev/solana-compression/digital-asset-standard-das-api)
- [Magic Eden API Docs](https://docs.magiceden.io/reference/solana-overview)
- [Dialect Actions Registry](https://dial.to)
- [Supabase Documentation](https://supabase.com/docs)

---

## Appendix: AI Development Prompts

Use these prompts with your AI coding assistant:

**Phase 2 Prompt:**
> "Create a Next.js GET route at `/api/actions/audit` that takes a wallet address as a query parameter, calls Helius DAS API to fetch all NFTs, aggregates them by collection with counts, and returns an ActionGetResponse with a multi-select parameter listing the user's NFT collections. Include rate limiting using Supabase."

**Phase 3 Prompt:**
> "Create a POST route at `/api/actions/audit` that receives selected collections from the request body, calculates the SOL price using our tiered pricing (0.02 base for first 20, +0.05 per additional 100), and returns a signable VersionedTransaction paying to our treasury. Set `links.next` to point to `/api/actions/reveal`."

**Phase 4 Prompt:**
> "Create a callback route at `/api/actions/reveal` that receives a transaction signature, verifies it hasn't been used (check Supabase), confirms the payment on-chain matches expected amount and treasury destination, fetches Magic Eden listings to calculate trait floors, fetches Helius transaction history for last sale data, generates a CSV report, saves it to Supabase, and returns a 'completed' ActionPostResponse with a download link for the CSV."
