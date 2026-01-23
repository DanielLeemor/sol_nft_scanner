"use client";

import React, { useMemo } from "react";
import {
    ConnectionProvider,
    WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";
// Default styles that can be overridden by your app
import "@solana/wallet-adapter-react-ui/styles.css";

import { WalletError } from "@solana/wallet-adapter-base";
import { useCallback, useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

// Helper component to reset wallet selection on mount
function WalletResetter() {
    const { select } = useWallet();
    const hasReset = useRef(false);

    useEffect(() => {
        // Force "Select Wallet" state on load ONLY ONCE
        if (!hasReset.current) {
            select(null);
            console.log("Wallet selection reset");
            hasReset.current = true;
        }
    }, [select]);
    return null;
}

export default function AppWalletProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    const network = WalletAdapterNetwork.Mainnet;
    const endpoint = useMemo(() => clusterApiUrl(network), [network]);
    const wallets = useMemo(
        () => [
            // Rely on Wallet Standard (auto-detection) by providing an empty array
            // This ensures only actually installed wallets are shown as "Detected"
        ],
        [network]
    );

    const onError = useCallback((error: WalletError) => {
        // Suppress "User rejected" errors as they are expected user behavior
        if (error.name === "WalletConnectionError" && error.message === "User rejected the request.") {
            return;
        }
        console.error(error);
    }, []);

    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect={false} onError={onError}>
                <WalletModalProvider>
                    <WalletResetter />
                    {children}
                </WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
}
