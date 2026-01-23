# 🔐 SolNFTscanner (Live)

> Discover hidden value in your Solana NFT portfolio

A Solana Action (Blink) that audits NFT portfolios to find traits worth more than floor price.

## 🚀 Features

- **Wallet Scan** - Connect wallet and see all your NFT collections
- **Trait Floor Analysis** - Calculate actual trait values from Magic Eden listings
- **Transaction History** - See last sale data for each NFT via Helius
- **CSV Export** - Download detailed reports with all the data

## 📋 Prerequisites

- Node.js 18+
- Supabase account (free tier works)
- Helius API key ($49/mo for production)
- Treasury wallet for receiving payments

## 🛠️ Setup

### 1. Clone and Install

```bash
npm install
```

### 2. Set Up Supabase

1. Create a new Supabase project at https://supabase.com
2. Go to SQL Editor and run the schema from `supabase/schema.sql`
3. Copy your project URL and service role key

### 3. Configure Environment

Copy `.env.local` and fill in your values:

```bash
# Helius - Blockchain Data & Wallet Scanning
HELIUS_API_KEY=your_helius_api_key
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=your_helius_api_key

# Supabase - Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Treasury
TREASURY_WALLET=your_treasury_wallet_address

# App
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

### 4. Run Development Server

```bash
npm run dev
```

Open http://localhost:3000 to see the landing page.

## 📡 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/actions/audit` | GET | Initial wallet scan, returns collection list |
| `/api/actions/audit` | POST | Generate payment transaction |
| `/api/actions/reveal` | POST | Verify payment and generate audit report |
| `/api/download` | GET | Download CSV report by ID |

## 💰 Pricing

| NFT Count | Price |
|-----------|-------|
| 1-20 | 0.02 SOL |
| 21-120 | 0.07 SOL |
| 121-220 | 0.12 SOL |
| 221+ | +0.05 SOL per 100 NFTs |

## 🚀 Deployment

### Netlify

1. Connect your repo to Netlify
2. Set environment variables in Netlify dashboard
3. Deploy (it will auto-detect Next.js)

### Register Blink

After deployment:

1. Go to https://dial.to
2. Register your domain
3. Submit for verification

## 📁 Project Structure

```
├── app/
│   ├── api/
│   │   ├── actions/
│   │   │   ├── audit/route.ts    # Main scan & payment endpoint
│   │   │   ├── reveal/route.ts   # Payment verification & report
│   │   │   └── manifest/route.ts # actions.json manifest
│   │   └── download/route.ts     # CSV download endpoint
│   ├── lib/
│   │   ├── constants.ts    # Config & CORS headers
│   │   ├── csv.ts          # CSV generation
│   │   ├── helius.ts       # Helius DAS API integration
│   │   ├── magiceden.ts    # Magic Eden API integration
│   │   ├── pricing.ts      # Price calculation logic
│   │   ├── rate-limit.ts   # Rate limiting
│   │   ├── signature.ts    # Payment verification
│   │   ├── supabase.ts     # Database client
│   │   └── utils.ts        # Utilities
│   ├── globals.css         # Landing page styles
│   ├── layout.tsx          # Root layout
│   └── page.tsx            # Landing page
├── public/
│   ├── .well-known/
│   │   └── actions.json    # Solana Actions manifest
│   ├── icon.png            # Blink icon
│   ├── success.png         # Success state icon
│   └── error.png           # Error state icon
├── supabase/
│   └── schema.sql          # Database schema
├── netlify.toml            # Netlify configuration
└── .env.local              # Environment variables
```

## 🔗 Resources

- [Solana Actions Spec](https://solana.com/docs/advanced/actions)
- [Helius DAS API](https://docs.helius.dev/solana-compression/digital-asset-standard-das-api)
- [Magic Eden API](https://docs.magiceden.io/reference/solana-overview)
- [Dialect Actions Registry](https://dial.to)

## 📞 Support

DM [@DLeemor](https://twitter.com/DLeemor) on Twitter for support.

## 📄 License

MIT
