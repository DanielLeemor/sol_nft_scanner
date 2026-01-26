# SolNFTscanner Update - Complete Integration Guide

## Overview

A major update has been integrated to the SolNFTscanner app adding USD price tracking, Tensor marketplace fallback, interactive report viewer, admin dashboard, and queue system.

---

## Files Changed

### Replaced (7 files)
| File | What Changed |
|------|--------------|
| `app/lib/helius.ts` | Sale detection with `type=NFT_SALE` filter, tier-based batching, parallel processing |
| `app/lib/magiceden.ts` | Smart symbol resolution, Tensor fallback integration |
| `app/lib/csv.ts` | 7 new USD columns added |
| `app/lib/supabase.ts` | Updated types with USD fields |
| `app/api/reports/process/route.ts` | USD calculations, queue system, tier-based processing |
| `app/reports/page.tsx` | Added "View Report" button, queue status handling |
| `app/components/NavConnect.tsx` | Shows "Admin" button for treasury wallet |

### Added New (7 files)
| File | Purpose |
|------|---------|
| `app/lib/tensor.ts` | Tensor API integration for floor price fallback |
| `app/lib/solprice.ts` | CoinGecko SOL/USD price service (current + historical) |
| `app/api/reports/[id]/route.ts` | API to fetch single report by ID |
| `app/api/admin/auth/route.ts` | Admin authorization (checks treasury wallet) |
| `app/api/admin/stats/route.ts` | Revenue statistics API (requires wallet header) |
| `app/reports/[id]/page.tsx` | Interactive report viewer with filters, sort, mobile cards |
| `app/admin/page.tsx` | Admin revenue dashboard |

### Kept Unchanged (6 files)
- `app/api/reports/route.ts` - Lists reports, handles DELETE
- `app/lib/constants.ts` - Already had TREASURY_WALLET export
- `app/lib/pricing.ts` - Price calculation logic
- `app/lib/rate-limit.ts` - Rate limiting logic
- `app/lib/signature.ts` - Payment verification
- `app/lib/utils.ts` - Helper functions

---

## Database Changes (Already Applied to Supabase)

### Modified: `audit_reports` table
```sql
-- New columns added:
priority INTEGER DEFAULT 0
queue_position INTEGER
started_at TIMESTAMP WITH TIME ZONE

-- Status constraint updated to include 'queued':
CHECK (status IN ('pending', 'queued', 'processing', 'partial', 'complete', 'failed'))
```

### Created: `api_usage_stats` table
```sql
CREATE TABLE api_usage_stats (
    id UUID PRIMARY KEY,
    date DATE NOT NULL UNIQUE,
    helius_calls INTEGER DEFAULT 0,
    helius_credits_used INTEGER DEFAULT 0,
    magiceden_calls INTEGER DEFAULT 0,
    tensor_calls INTEGER DEFAULT 0,
    coingecko_calls INTEGER DEFAULT 0,
    nfts_processed INTEGER DEFAULT 0,
    reports_completed INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Created: `increment_api_usage()` function
Upserts daily API usage stats for monitoring.

---

## Environment Variables

Added to `.env.local`:
```bash
HELIUS_TIER=developer          # Controls batch size: "free", "developer", "business"
TREASURY_WALLET=<wallet>       # Treasury wallet for admin access
```

---

## New Features

### 1. USD Price Tracking
- Fetches current SOL price from CoinGecko
- Fetches historical SOL price for each sale date
- Calculates profit/loss in USD

**New CSV columns:**
| Column | Description |
|--------|-------------|
| `floor_price_usd` | Floor × current SOL price |
| `last_sale_usd` | Sale × historical SOL price |
| `sol_price_at_sale` | SOL/USD on purchase date |
| `profit_vs_floor_usd` | Floor USD - Sale USD |
| `highest_trait_usd` | Trait × current SOL |
| `profit_vs_trait_usd` | (Trait or Floor) - Sale USD |
| `current_sol_price` | Today's SOL/USD |

### 2. Tensor Fallback
- When Magic Eden doesn't have a collection, falls back to Tensor
- Uses collection address directly (no symbol guessing needed)
- Free API, no key required

### 3. Interactive Report Viewer
- URL: `/reports/[id]`
- Search by NFT name, collection, trait
- Filter by collection dropdown
- Filter by profit/loss (profitable only, losses only)
- Filter rare traits only
- Sortable columns
- Mobile-optimized card view
- Direct links to Magic Eden and Tensor

### 4. Admin Dashboard
- URL: `/admin`
- Only accessible when connected with treasury wallet
- Shows: total revenue, orders, NFTs processed, unique customers
- Daily revenue chart
- Recent transactions with Solscan links
- Date range filter (7d, 30d, 90d, all time)

### 5. Queue System
- Supports multiple concurrent users
- Developer tier: 3 simultaneous processing slots
- Additional requests get `status: "queued"`
- Auto-starts when slot opens

---

## Technical Notes

### Next.js 15 Compatibility
API routes use the new params pattern:
```typescript
{ params }: { params: Promise<{ id: string }> }
const { id } = await params;
```

### Admin Security
The stats API requires `x-wallet-address` header matching TREASURY_WALLET:
```typescript
const res = await fetch(`/api/admin/stats?range=${dateRange}`, {
    headers: {
        "x-wallet-address": publicKey?.toBase58() || "",
    },
});
```

### Report JSON Safety
The viewer checks for array before mapping:
```typescript
if (!report?.report_json || !Array.isArray(report.report_json)) return [];
```

---

## Expected Console Logs

When processing reports, you should see:
```
[Process] Using tier "developer": batchSize=15
[CoinGecko] Current SOL price: $XXX
[ME] Found working symbol: collection_name
[ME→Tensor] Fallback successful for "CollectionName": X.XX SOL
[Process] Fetched X historical SOL prices, current: $XXX
```

---

## Testing Checklist

- [ ] Generate a report and verify USD columns in CSV
- [ ] Check that `profit_vs_floor_usd` = `floor_price_usd` - `last_sale_usd`
- [ ] Open interactive viewer at `/reports/[id]`, test filters and sorting
- [ ] Test mobile view - should show cards instead of table
- [ ] Connect treasury wallet, verify "Admin" button appears in nav
- [ ] Access `/admin` and verify stats load
- [ ] Connect non-treasury wallet, verify no admin access
- [ ] Test with collection that's not on Magic Eden (should fallback to Tensor)

---

## File Structure After Integration

```
app/
├── admin/
│   └── page.tsx                    ← NEW: Admin dashboard
├── api/
│   ├── admin/
│   │   ├── auth/
│   │   │   └── route.ts            ← NEW: Admin auth
│   │   └── stats/
│   │       └── route.ts            ← NEW: Revenue stats
│   └── reports/
│       ├── route.ts                ← UNCHANGED: List/delete reports
│       ├── process/
│       │   └── route.ts            ← REPLACED: Main processing
│       └── [id]/
│           └── route.ts            ← NEW: Fetch single report
├── components/
│   └── NavConnect.tsx              ← REPLACED: Admin link added
├── lib/
│   ├── constants.ts                ← UNCHANGED
│   ├── csv.ts                      ← REPLACED: USD columns
│   ├── helius.ts                   ← REPLACED: Sale detection
│   ├── magiceden.ts                ← REPLACED: Tensor fallback
│   ├── pricing.ts                  ← UNCHANGED
│   ├── rate-limit.ts               ← UNCHANGED
│   ├── signature.ts                ← UNCHANGED
│   ├── solprice.ts                 ← NEW: CoinGecko service
│   ├── supabase.ts                 ← REPLACED: USD types
│   ├── tensor.ts                   ← NEW: Tensor API
│   └── utils.ts                    ← UNCHANGED
└── reports/
    ├── page.tsx                    ← REPLACED: View button added
    └── [id]/
        └── page.tsx                ← NEW: Interactive viewer
```

---

## API Endpoints Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/reports?wallet=X` | GET | List all reports for wallet |
| `/api/reports?id=X` | DELETE | Delete a report |
| `/api/reports/[id]` | GET | Fetch single report |
| `/api/reports/process` | POST | Process NFT batch |
| `/api/admin/auth` | POST | Verify treasury wallet |
| `/api/admin/stats?range=X` | GET | Revenue statistics (requires header) |

---

## Questions?

If anything is unclear or you encounter errors, check:
1. Console logs for API errors
2. Supabase logs for database errors
3. Network tab for failed requests
4. Verify `.env.local` has correct values
