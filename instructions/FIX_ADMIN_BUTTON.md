# Fix: Admin Button Not Showing in Navigation

## Problem
The Admin button doesn't appear in the navigation bar when connected with the treasury wallet, even though the `/admin` page works when accessed directly.

## Cause
The `NavConnect.tsx` component imports `TREASURY_WALLET` from `constants.ts`, but that file reads `process.env` at runtime which doesn't work properly for client-side components in Next.js.

## Solution
Change `NavConnect.tsx` to read the environment variable directly instead of importing from constants.

## File to Change
`app/components/NavConnect.tsx`

## Change Required

**Replace lines 1-15 (the imports and beginning of the component):**

### FROM:
```tsx
"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { TREASURY_WALLET } from "@/app/lib/constants";

const WalletMultiButtonDynamic = dynamic(
    async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
    { ssr: false }
);

export default function NavConnect() {
    const { publicKey, connected } = useWallet();
    const isAdmin = connected && publicKey?.toBase58() === TREASURY_WALLET;
```

### TO:
```tsx
"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";

// Access env variable directly for client-side components
const TREASURY_WALLET = process.env.NEXT_PUBLIC_TREASURY_WALLET || "";

const WalletMultiButtonDynamic = dynamic(
    async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
    { ssr: false }
);

export default function NavConnect() {
    const { publicKey, connected } = useWallet();
    const isAdmin = connected && publicKey?.toBase58() === TREASURY_WALLET;
```

## Summary of Change
1. Remove the import: `import { TREASURY_WALLET } from "@/app/lib/constants";`
2. Add this line after the other imports: `const TREASURY_WALLET = process.env.NEXT_PUBLIC_TREASURY_WALLET || "";`

## After Deploying
The Admin button (📊 Admin) will appear next to the wallet button when connected with the treasury wallet.
