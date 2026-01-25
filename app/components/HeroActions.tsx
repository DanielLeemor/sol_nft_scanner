"use client";

import { useState, useEffect, useMemo } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import { VersionedTransaction } from "@solana/web3.js";
import { calculatePrice } from "@/app/lib/pricing";

const WalletMultiButtonDynamic = dynamic(
    async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
    { ssr: false }
);

interface NftItem {
    id: string;
    name: string;
}

interface Collection {
    id: string;
    name: string;
    count: number;
    icon?: string;
    nfts: NftItem[];
}

interface ScanResult {
    wallet: string;
    totalNfts: number;
    totalCollections: number;
    estimatedPrice: number;
    estimatedPriceFormatted: string;
    collections: Collection[];
}

export default function HeroActions() {
    const { connection } = useConnection();
    const { publicKey, connected, sendTransaction } = useWallet();
    const [loading, setLoading] = useState(false);
    const [scanResult, setScanResult] = useState<ScanResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Track SELECTED NFTs by their Mint ID
    const [selectedNftIds, setSelectedNftIds] = useState<Set<string>>(new Set());

    // Track Expanded Collections (for UI)
    const [expandedCollections, setExpandedCollections] = useState<Set<string>>(new Set());

    // Effect: Default Selection
    useEffect(() => {
        if (scanResult) {
            const defaultSelected = new Set<string>();
            scanResult.collections.forEach(c => {
                // Default: Select everything EXCEPT "Unknown"
                if (c.name !== "Unknown") {
                    c.nfts.forEach(nft => defaultSelected.add(nft.id));
                }
            });
            setSelectedNftIds(defaultSelected);
        }
    }, [scanResult]);

    // Reset when wallet changes
    useEffect(() => {
        setScanResult(null);
        setSelectedNftIds(new Set());
        setExpandedCollections(new Set());
        setError(null);
    }, [publicKey]);

    // Derived Stats
    const selectedStats = useMemo(() => {
        const count = selectedNftIds.size;
        return {
            count,
            price: calculatePrice(count)
        };
    }, [selectedNftIds]);

    const [targetWalletInput, setTargetWalletInput] = useState("");
    const isAdmin = publicKey?.toBase58() === process.env.NEXT_PUBLIC_TREASURY_WALLET;

    const handleScan = async () => {
        if (!publicKey) return;

        setLoading(true);
        setError(null);

        const walletToScan = (isAdmin && targetWalletInput) ? targetWalletInput : publicKey.toBase58();

        try {
            const res = await fetch(`/api/scan?wallet=${walletToScan}`);
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Scan failed");
            }

            setScanResult(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Use Error");
        } finally {
            setLoading(false);
        }
    };

    // Toggle entire collection
    const toggleCollection = (collection: Collection) => {
        const newSet = new Set(selectedNftIds);
        const allSelected = collection.nfts.every(nft => newSet.has(nft.id));

        if (allSelected) {
            // Deselect all
            collection.nfts.forEach(nft => newSet.delete(nft.id));
        } else {
            // Select all
            collection.nfts.forEach(nft => newSet.add(nft.id));
        }
        setSelectedNftIds(newSet);
    };

    // Toggle individual NFT
    const toggleNft = (id: string) => {
        const newSet = new Set(selectedNftIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedNftIds(newSet);
    };

    const toggleExpand = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const newSet = new Set(expandedCollections);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setExpandedCollections(newSet);
    };

    const toggleAll = () => {
        if (!scanResult) return;

        // Check if everything is selected
        const allMints = scanResult.collections.flatMap(c => c.nfts.map(n => n.id));
        const allSelected = allMints.every(id => selectedNftIds.has(id));

        if (allSelected) {
            setSelectedNftIds(new Set());
        } else {
            setSelectedNftIds(new Set(allMints));
        }
    };

    const handlePayment = async () => {
        if (!scanResult || !publicKey) return;

        if (selectedStats.count === 0) {
            alert("Please select at least one NFT.");
            return;
        }

        try {
            setLoading(true);

            // Send selected mints
            const selectedMints = Array.from(selectedNftIds);
            const walletToScan = (isAdmin && targetWalletInput) ? targetWalletInput : publicKey.toBase58();

            const res = await fetch(`/api/actions/audit?wallet=${walletToScan}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    account: publicKey.toBase58(),
                    targetWallet: walletToScan,
                    data: {
                        mints: selectedMints
                    }
                })
            });

            const data = await res.json();

            if (data.bypass) {
                // Admin Bypass: Skip signing, go straight to reveal
                // We just need to trigger the reveal backend logic to finalize the report
                const revealRes = await fetch("/api/actions/reveal", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        account: publicKey.toBase58(),
                        targetWallet: walletToScan,
                        signature: "ADMIN_BYPASS", // Special flag
                        reportId: data.reportId
                    })
                });

                if (revealRes.ok) {
                    const revealData = await revealRes.json();

                    // Redirect to reports page after a short delay
                    // This gives the user context that processing has started
                    setTimeout(() => {
                        window.location.href = "/reports";
                    }, 2000);
                } else {
                    const errData = await revealRes.json();
                    const errMsg = errData.error?.message || errData.error || "Unknown error";
                    alert(`Report Generation Failed: ${errMsg}`);
                }
                return;
            }

            if (data.transaction) {
                // Deserialize the transaction
                const serializeConfig = { requireAllSignatures: false };
                const txBuffer = Buffer.from(data.transaction, "base64");
                const transaction = VersionedTransaction.deserialize(txBuffer);

                // Send transaction via wallet
                const signature = await sendTransaction(transaction, connection);

                // Monitor confirmation manually for better reliability
                let confirmed = false;
                try {
                    const latestBlockhash = await connection.getLatestBlockhash();
                    const confirmation = await connection.confirmTransaction({
                        signature,
                        blockhash: latestBlockhash.blockhash,
                        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
                    }, "confirmed");

                    if (confirmation.value.err) {
                        throw new Error("Transaction failed on-chain");
                    }
                    confirmed = true;
                } catch (confirmError) {
                    console.warn("Confirmation timed out, checking status manually...", confirmError);

                    // Fallback: Check status directly
                    const status = await connection.getSignatureStatus(signature);
                    if (status.value?.confirmationStatus === "confirmed" || status.value?.confirmationStatus === "finalized") {
                        if (status.value.err) {
                            throw new Error("Transaction failed on-chain");
                        }
                        confirmed = true;
                        console.log("Transaction explicitly confirmed via status check.");
                    }
                }

                if (!confirmed) {
                    throw new Error("Transaction confirmation timed out. Please check your wallet history.");
                }

                // Call the REVEAL endpoint to finalize the report
                const revealRes = await fetch(data.links.next.href, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        account: publicKey.toBase58(),
                        signature: signature,
                        targetWallet: walletToScan,
                        // reportId is already in the URL params from data.links.next.href
                    })
                });

                if (revealRes.ok) {
                    const revealData = await revealRes.json();
                    // Redirect to reports page
                    setTimeout(() => {
                        window.location.href = "/reports";
                    }, 2000);
                } else {
                    throw new Error("Report generation failed after payment");
                }
            } else if (data.error) {
                throw new Error(data.error);
            }
        } catch (err) {
            console.error(err);
            alert(err instanceof Error ? err.message : "Error creating transaction");
        } finally {
            setLoading(false);
        }
    };

    if (!connected) {
        return (
            <div className="flex flex-col items-start gap-4">
                <WalletMultiButtonDynamic style={{
                    background: 'linear-gradient(135deg, #9945FF 0%, #14F195 100%)',
                    fontSize: '1rem',
                    fontWeight: 600,
                    padding: '0 32px',
                    height: '56px',
                    borderRadius: '12px'
                }} />
                <p className="text-sm text-[var(--text-secondary)]">
                    Supports Phantom, Solflare, Backpack, and more
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-start gap-6 w-full max-w-xl">
            {!scanResult ? (
                <div className="w-full space-y-4">
                    {isAdmin && (
                        <div className="w-full animate-in fade-in slide-in-from-top-2">
                            <label className="text-xs font-semibold text-[var(--solana-green)] uppercase tracking-wider mb-2 block">
                                Admin Mode: Target Wallet
                            </label>
                            <input
                                type="text"
                                value={targetWalletInput}
                                onChange={(e) => setTargetWalletInput(e.target.value)}
                                placeholder="Enter wallet address to audit..."
                                className="w-full bg-[var(--bg-card)] border border-[var(--solana-green)]/50 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--solana-green)]"
                            />
                        </div>
                    )}
                    <button
                        onClick={handleScan}
                        disabled={loading}
                        className="btn-primary w-full justify-center"
                    >
                        {loading ? "Scanning Wallet..." : (isAdmin && targetWalletInput ? "Audit Target Wallet" : "Audit My Portfolio")}
                    </button>
                </div>
            ) : (
                <div className="bg-[var(--bg-card)] border border-white/10 rounded-xl p-6 w-full animate-in fade-in slide-in-from-bottom-4 shadow-2xl">
                    <div className="flex justify-between items-center mb-4 pb-4 border-b border-white/10">
                        <span className="text-lg font-bold text-white">Select NFTs</span>
                        <button
                            onClick={toggleAll}
                            className="text-xs font-semibold text-[var(--solana-purple)] hover:text-white transition-colors bg-white/5 px-3 py-1.5 rounded-md hover:bg-white/10"
                        >
                            {selectedNftIds.size === scanResult.totalNfts ? "Deselect All" : "Select All"}
                        </button>
                    </div>

                    <div className="max-h-80 overflow-y-auto pr-2 mb-6 space-y-2 custom-scrollbar">
                        {scanResult.collections.map((collection) => {
                            const selectedCount = collection.nfts.filter(n => selectedNftIds.has(n.id)).length;
                            const isFullySelected = selectedCount === collection.count && collection.count > 0;
                            const isPartiallySelected = selectedCount > 0 && !isFullySelected;
                            const isExpanded = expandedCollections.has(collection.id);

                            return (
                                <div key={collection.id} className="bg-white/5 rounded-lg border border-transparent hover:border-white/10 transition-colors">
                                    {/* Collection Header */}
                                    <div
                                        className="flex items-center justify-between p-3.5 cursor-pointer"
                                        onClick={() => toggleCollection(collection)}
                                    >
                                        <div className="flex items-center gap-4 overflow-hidden">
                                            {/* Checkbox */}
                                            <div className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center transition-colors border-2 ${isFullySelected || isPartiallySelected
                                                ? "bg-[var(--solana-purple)] border-[var(--solana-purple)]"
                                                : "border-white/30 group-hover:border-white/60"
                                                }`}>
                                                {isFullySelected && (
                                                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                        <path d="M2 6L4.5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                    </svg>
                                                )}
                                                {isPartiallySelected && (
                                                    <div className="w-2.5 h-0.5 bg-white rounded-full" />
                                                )}
                                            </div>

                                            {/* Name */}
                                            <span className={`text-sm font-medium truncate select-none ${isFullySelected ? "text-white" : "text-gray-300"}`}>
                                                {collection.name}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <span className="text-xs font-mono bg-black/30 px-2 py-1 rounded text-gray-400 whitespace-nowrap">
                                                {selectedCount}/{collection.count}
                                            </span>
                                            {/* Expand Button */}
                                            <button
                                                onClick={(e) => toggleExpand(e, collection.id)}
                                                className="p-1 hover:bg-white/10 rounded"
                                            >
                                                <svg
                                                    width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                                    className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}
                                                >
                                                    <path d="M6 9l6 6 6-6" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Expanded NFT List */}
                                    {isExpanded && (
                                        <div className="border-t border-white/5 p-2 space-y-1 bg-black/20">
                                            {collection.nfts.map(nft => {
                                                const isNftSelected = selectedNftIds.has(nft.id);
                                                return (
                                                    <div
                                                        key={nft.id}
                                                        onClick={() => toggleNft(nft.id)}
                                                        className={`flex items-center gap-3 p-2 rounded cursor-pointer ${isNftSelected ? "bg-[var(--solana-purple)]/10" : "hover:bg-white/5"
                                                            }`}
                                                    >
                                                        <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${isNftSelected
                                                            ? "bg-[var(--solana-purple)] border-[var(--solana-purple)]"
                                                            : "border-white/30"
                                                            }`}>
                                                            {isNftSelected && (
                                                                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                                    <path d="M2 6L4.5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                                </svg>
                                                            )}
                                                        </div>
                                                        <span className="text-xs text-gray-300 truncate">{nft.name}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-6 pt-4 border-t border-white/10">
                        <div className="text-center p-3 bg-white/5 rounded-lg border border-white/5">
                            <div className="text-2xl font-bold gradient-text">{selectedStats.count}</div>
                            <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">Selected NFTs</div>
                        </div>
                        <div className="text-center p-3 bg-white/5 rounded-lg border border-white/5">
                            <div className="text-2xl font-bold text-[var(--solana-green)]">{selectedStats.price.toFixed(2)} SOL</div>
                            <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">Estimated Cost</div>
                        </div>
                    </div>

                    <button
                        onClick={handlePayment}
                        className="btn-primary w-full justify-center py-3 text-lg font-semibold shadow-lg shadow-purple-500/20"
                        disabled={loading || selectedStats.count === 0}
                    >
                        {loading ? "Processing..." : `Pay ${selectedStats.price.toFixed(2)} SOL & Reveal`}
                    </button>
                </div>
            )}

            {error && (
                <div className="text-red-400 text-sm bg-red-500/10 p-4 rounded-xl border border-red-500/20 w-full animate-in fade-in">
                    <span className="font-bold block mb-1">Error</span>
                    {error}
                </div>
            )}
        </div>
    );
}
