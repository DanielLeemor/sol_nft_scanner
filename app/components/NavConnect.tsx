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

    return (
        <div className="nav-wallet-container" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {isAdmin && (
                <Link
                    href="/admin"
                    style={{
                        background: 'linear-gradient(135deg, #9945FF 0%, #14F195 100%)',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        color: 'white',
                        textDecoration: 'none',
                        fontSize: '14px',
                        fontWeight: '600',
                    }}
                >
                    📊 Admin
                </Link>
            )}
            <div className="nav-wallet-btn">
                <WalletMultiButtonDynamic style={{
                    backgroundColor: 'var(--solana-purple)',
                    backgroundImage: 'linear-gradient(135deg, #9945FF 0%, #14F195 100%)',
                    height: '40px',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    padding: '0 20px',
                    whiteSpace: 'nowrap'
                }} />
            </div>
        </div>
    );
}
