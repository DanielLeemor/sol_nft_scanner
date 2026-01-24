"use client";

import dynamic from "next/dynamic";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

const WalletMultiButtonDynamic = dynamic(
    async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
    { ssr: false }
);

export default function NavConnect() {
    return (
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
    );
}
