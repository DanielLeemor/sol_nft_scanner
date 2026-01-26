# Fix: Admin Detection Not Working

## Problem
The admin features (Admin button in nav, target wallet input field) are not showing when connected with the treasury wallet because the environment variable isn't being read correctly at runtime.

## Root Cause
`process.env.NEXT_PUBLIC_*` variables are replaced at build time by Next.js. If the variable is empty or undefined during build, it stays empty. The fallback `|| ""` means it's always an empty string, so `isAdmin` is always `false`.

## Solution
Add the treasury wallet address as a hardcoded fallback in both components.

---

## File 1: `app/components/NavConnect.tsx`

### Change line 8 from:
```tsx
const TREASURY_WALLET = process.env.NEXT_PUBLIC_TREASURY_WALLET || "";
```

### To:
```tsx
const TREASURY_WALLET = process.env.NEXT_PUBLIC_TREASURY_WALLET || "5mwMWEiidJ38XSnDeZawXP9Hfd4AE1qwUcZaqpDTPEFp";
```

---

## File 2: `app/components/HeroActions.tsx`

### Change lines 80-81 from:
```tsx
const [targetWalletInput, setTargetWalletInput] = useState("");
const isAdmin = publicKey?.toBase58() === process.env.NEXT_PUBLIC_TREASURY_WALLET;
```

### To:
```tsx
const [targetWalletInput, setTargetWalletInput] = useState("");

// Treasury wallet for admin detection - use env var with fallback
const TREASURY_WALLET = process.env.NEXT_PUBLIC_TREASURY_WALLET || "5mwMWEiidJ38XSnDeZawXP9Hfd4AE1qwUcZaqpDTPEFp";
const isAdmin = publicKey?.toBase58() === TREASURY_WALLET;
```

---

## After Deploying
When connected with the treasury wallet:
1. The "📊 Admin" button will appear in the navigation bar
2. An "Admin Mode: Target Wallet" input field will appear on the home page to scan other wallets
