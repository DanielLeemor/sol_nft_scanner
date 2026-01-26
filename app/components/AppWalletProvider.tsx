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
import { useCallback } from "react";

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
            {/* autoConnect=true allows wallet to persist across page navigations */}
            <WalletProvider wallets={wallets} autoConnect={true} onError={onError}>
                <WalletModalProvider>
                    {children}
                </WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
}
