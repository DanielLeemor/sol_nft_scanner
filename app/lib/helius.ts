import { HELIUS_RPC_URL, HELIUS_API_KEY } from "./constants";

// NFT metadata from Helius DAS API
export interface HeliusNFT {
    id: string;
    content: {
        json_uri?: string;
        metadata?: {
            name?: string;
            symbol?: string;
            description?: string;
            attributes?: Array<{
                trait_type: string;
                value: string;
            }>;
        };
    };
    grouping?: Array<{
        group_key: string;
        group_value: string;
        collection_metadata?: {
            name?: string;
            symbol?: string;
            description?: string;
            attributes?: string;
        };
    }>;
    ownership: {
        owner: string;
    };
}

// Grouped collection data
export interface CollectionGroup {
    id: string;
    name: string;
    symbol: string;
    count: number;
    nfts: HeliusNFT[];
}

// Transaction data from Helius Enhanced Transactions API
export interface HeliusTransaction {
    signature: string;
    timestamp: number;
    type: string;
    source: string;
    feePayer: string;
    tokenTransfers?: Array<{
        fromUserAccount?: string;
        toUserAccount?: string;
        mint?: string;
        tokenAmount?: number;
    }>;
    nativeTransfers?: Array<{
        fromUserAccount?: string;
        toUserAccount?: string;
        amount?: number;
    }>;
    events: {
        nft?: {
            seller?: string;
            buyer?: string;
            amount?: number;
            type?: string;
            nfts?: Array<{
                mint?: string;
            }>;
        };
    };
    accountData?: Array<{
        account: string;
        nativeBalanceChange: number;
        tokenBalanceChanges: Array<unknown>;
    }>;
}

/**
 * Fetch all NFTs owned by a wallet using Helius DAS API
 */
export async function fetchWalletNFTs(walletAddress: string): Promise<HeliusNFT[]> {
    const allItems: HeliusNFT[] = [];
    let page = 1;
    const limit = 1000;

    while (true) {
        const response = await fetch(HELIUS_RPC_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: `scan-${page}`,
                method: "getAssetsByOwner",
                params: {
                    ownerAddress: walletAddress,
                    page,
                    limit,
                    displayOptions: {
                        showCollectionMetadata: true,
                        showFungible: false,
                    },
                },
            }),
        });

        if (!response.ok) {
            throw new Error(`Helius API error: ${response.status}`);
        }

        const data = await response.json();

        if (data.error) {
            throw new Error(`Helius API error: ${data.error.message}`);
        }

        const items = data.result?.items || [];
        allItems.push(...items);

        // If we got fewer items than the limit, we've reached the end
        if (items.length < limit) {
            break;
        }

        page++;
    }

    return allItems;
}

/**
 * Fetch metadata for multiple NFTs in a single request using Helius getAssetBatch
 */
export async function fetchNFTMetadataBatch(mintAddresses: string[]): Promise<HeliusNFT[]> {
    if (mintAddresses.length === 0) return [];

    // Helius allows up to 100 assets per batch
    let response: Response | null = null;
    let attempts = 0;

    while (attempts < 3) {
        try {
            response = await fetch(HELIUS_RPC_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: `batch-${Date.now()}`,
                    method: "getAssetBatch",
                    params: {
                        ids: mintAddresses
                    },
                }),
            });

            if (response.ok) break;

            if (response.status === 429 || response.status >= 500) {
                await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempts)));
                attempts++;
            } else {
                throw new Error(`Helius Batch API error: ${response.status}`);
            }
        } catch (err) {
            console.warn(`Batch fetch attempt ${attempts + 1} failed:`, err);
            attempts++;
            if (attempts >= 3) throw err;
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    if (!response || !response.ok) {
        throw new Error(`Helius Batch API error: ${response?.status}`);
    }

    const data = await response.json();
    if (data.error) {
        throw new Error(`Helius Batch API error: ${data.error.message}`);
    }

    return data.result || [];
}

/**
 * Group NFTs by collection
 */
export function groupNFTsByCollection(nfts: HeliusNFT[]): Map<string, CollectionGroup> {
    const collections = new Map<string, CollectionGroup>();

    for (const nft of nfts) {
        const collectionGrouping = nft.grouping?.find(g => g.group_key === "collection");
        const collectionId = collectionGrouping?.group_value || "Unknown";

        let collectionName = collectionGrouping?.collection_metadata?.name || collectionId;
        if (collectionName === collectionId || !collectionName) {
            const nftName = nft.content?.metadata?.name || "";
            const match = nftName.match(/^(.*?)\s*#\d+/);
            if (match) {
                collectionName = match[1].trim();
            }
        }

        const collectionSymbol = collectionGrouping?.collection_metadata?.symbol ||
            collectionName.toLowerCase().replace(/\s+/g, "_");

        if (!collections.has(collectionId)) {
            collections.set(collectionId, {
                id: collectionId,
                name: collectionName,
                symbol: collectionSymbol,
                count: 0,
                nfts: [],
            });
        }

        const collection = collections.get(collectionId)!;
        collection.count++;
        collection.nfts.push(nft);
    }

    return collections;
}

/**
 * Fetch NFT SALE transactions specifically for an NFT using the type=NFT_SALE filter
 * This is the correct way to get actual sale transactions from Helius
 */
export async function fetchNFTSaleHistory(
    nftMintAddress: string
): Promise<HeliusTransaction[]> {
    const allTransactions: HeliusTransaction[] = [];
    let lastSignature: string | null = null;

    // Fetch up to 2 pages (200 txs) of NFT_SALE transactions
    // Using type=NFT_SALE filter ensures we only get actual sales
    for (let i = 0; i < 2; i++) {
        let url = `https://api.helius.xyz/v0/addresses/${nftMintAddress}/transactions?api-key=${HELIUS_API_KEY}&type=NFT_SALE`;
        if (lastSignature) url += `&before=${lastSignature}`;

        let response: Response | null = null;
        let attempts = 0;

        while (attempts < 3) {
            try {
                response = await fetch(url);
                if (response.ok) break;
                if (response.status === 429 || response.status >= 500) {
                    // Wait and retry
                    await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempts)));
                    attempts++;
                } else {
                    break; // Fatal error (400, 401, 404)
                }
            } catch (err) {
                attempts++;
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        if (!response || !response.ok) {
            console.warn(`Failed to fetch NFT_SALE history for ${nftMintAddress}: ${response?.status}`);
            break;
        }

        const transactions = await response.json();
        if (!Array.isArray(transactions) || transactions.length === 0) break;

        allTransactions.push(...transactions);
        lastSignature = transactions[transactions.length - 1].signature;

        // If we got less than 100, we've reached the end
        if (transactions.length < 100) break;
    }

    return allTransactions;
}

/**
 * Legacy function - Fetch all transaction history for an NFT (without type filter)
 * Only use this as a fallback if NFT_SALE filter returns empty
 */
export async function fetchNFTTransactionHistory(
    nftMintAddress: string
): Promise<HeliusTransaction[]> {
    const allTransactions: HeliusTransaction[] = [];
    let lastSignature: string | null = null;

    // Fetch just 1 page (100 txs) by default to save credits and speed up
    for (let i = 0; i < 1; i++) {
        let url = `https://api.helius.xyz/v0/addresses/${nftMintAddress}/transactions?api-key=${HELIUS_API_KEY}`;
        if (lastSignature) url += `&before=${lastSignature}`;

        let response: Response | null = null;
        let attempts = 0;

        while (attempts < 3) {
            try {
                response = await fetch(url);
                if (response.ok) break;
                if (response.status === 429 || response.status >= 500) {
                    await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempts)));
                    attempts++;
                } else {
                    break;
                }
            } catch (err) {
                attempts++;
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        if (!response || !response.ok) {
            console.warn(`Failed to fetch tx history for ${nftMintAddress}: ${response?.status}`);
            break;
        }

        const transactions = await response.json();
        if (!Array.isArray(transactions) || transactions.length === 0) break;

        allTransactions.push(...transactions);
        lastSignature = transactions[transactions.length - 1].signature;

        if (transactions.length < 100) break;
    }

    return allTransactions;
}

/**
 * Extract last sale data from NFT_SALE transactions
 * When using the type=NFT_SALE filter, the transactions are already pre-filtered
 * and the events.nft object contains the sale details
 */
export function extractLastSaleFromSaleHistory(
    transactions: HeliusTransaction[],
    targetMint: string
): {
    date: string;
    price: number;
    from: string;
    to: string;
    signature: string;
} | null {
    if (!transactions || transactions.length === 0) {
        return null;
    }

    // Transactions are returned in reverse chronological order (newest first)
    // Find the first (most recent) sale that involves our specific NFT
    for (const tx of transactions) {
        // Skip if not an NFT_SALE type
        if (tx.type !== "NFT_SALE") continue;

        // Check if this sale involves our target mint
        const nftEvent = tx.events?.nft;
        if (!nftEvent) continue;

        // For batch sales, check if our mint is in the nfts array
        const involvesMint = 
            nftEvent.nfts?.some(n => n.mint === targetMint) ||
            tx.tokenTransfers?.some(t => t.mint === targetMint);

        if (!involvesMint && tx.tokenTransfers && tx.tokenTransfers.length > 0) {
            // If there's only one NFT in the transaction, assume it's ours
            const distinctMints = new Set(tx.tokenTransfers.map(t => t.mint).filter(Boolean));
            if (distinctMints.size !== 1) continue;
        }

        // Extract sale details from the nft event
        const price = (nftEvent.amount || 0) / 1e9; // Convert lamports to SOL
        const seller = nftEvent.seller || "Unknown";
        const buyer = nftEvent.buyer || "Unknown";

        if (price > 0) {
            console.log(`[DEBUG] Found NFT_SALE - Price: ${price} SOL, Sig: ${tx.signature.substring(0, 8)}...`);
            return {
                date: new Date((tx.timestamp || 0) * 1000).toISOString(),
                price,
                from: seller,
                to: buyer,
                signature: tx.signature,
            };
        }
    }

    return null;
}

/**
 * Legacy extraction function for general transaction history
 * Used as fallback when NFT_SALE filter returns no results
 */
const MARKETPLACES = new Set([
    "MAGIC_EDEN",
    "TENSOR",
    "SOLANART",
    "OPENSEA",
    "SNIPER",
    "CORAL_CUBE",
    "HADESWAP",
    "YAWWW"
]);

export function extractLastSale(transactions: HeliusTransaction[], targetMint: string): {
    date: string;
    price: number;
    from: string;
    to: string;
    signature: string;
} | null {
    if (!transactions || transactions.length === 0) {
        return null;
    }

    // Scan ALL transactions to find candidates
    const candidates: Array<{
        date: string;
        price: number;
        from: string;
        to: string;
        signature: string;
        tier: number; // 4: Explicit NFT_SALE, 3: NFT Event, 2: Marketplace, 1: Unknown
        timestamp: number;
    }> = [];

    // Priority types for explicit event pricing
    const SALE_TYPES = new Set(["NFT_SALE", "NFT_MINT", "NFT_AUCTION_SETTLED"]);

    // Explicitly BLACKLIST non-sale types to avoid even looking at them
    const IGNORE_TYPES = new Set([
        "NFT_BID",
        "NFT_BID_CANCELLED",
        "NFT_LISTING",
        "NFT_CANCEL_LISTING",
        "NFT_OFFER",
        "NFT_OFFER_CANCELLED",
        "TRANSFER",
        "UNKNOWN"
    ]);

    for (const tx of transactions) {
        if (IGNORE_TYPES.has(tx.type)) continue;

        let price = 0;
        let from = "Unknown";
        let to = "Unknown";
        let tier = 1;

        // 1. Check for explicit NFT_SALE type first (highest priority)
        if (tx.type === "NFT_SALE" && tx.events?.nft) {
            const nftEvent = tx.events.nft;
            price = (nftEvent.amount || 0) / 1e9;
            from = nftEvent.seller || "Unknown";
            to = nftEvent.buyer || "Unknown";
            
            if (price > 0) {
                candidates.push({
                    date: new Date((tx.timestamp || 0) * 1000).toISOString(),
                    price,
                    from,
                    to,
                    signature: tx.signature || "Unknown",
                    tier: 4, // Highest tier for NFT_SALE
                    timestamp: tx.timestamp || 0
                });
                continue;
            }
        }

        // 2. Identify NFT Movement for this specific mint
        const nftTransfer = tx.tokenTransfers?.find(t => t.mint === targetMint);

        // If NO NFT movement and NO explicit NFT event, skip
        if (!nftTransfer && !tx.events?.nft) {
            continue;
        }

        // Check Batch Status
        const distinctMints = new Set(tx.tokenTransfers?.map(t => t.mint).filter(m => m));
        const isBatch = distinctMints.size > 1;

        if (nftTransfer) {
            from = nftTransfer.fromUserAccount || "Unknown";
            to = nftTransfer.toUserAccount || "Unknown";
        }

        // 3. Check for NFT event with amount
        let eventPrice = 0;
        if (tx.events?.nft && tx.events.nft.amount) {
            const eventType = tx.events.nft.type || tx.type;
            if (SALE_TYPES.has(eventType)) {
                eventPrice = (tx.events.nft.amount || 0) / 1e9;
                from = tx.events.nft.seller || from;
                to = tx.events.nft.buyer || to;
                tier = 3;
            }
        }

        // 4. Fallback: Native Flow Analysis (Bidirectional)
        let calculatedPrice = 0;

        if (!isBatch && tx.nativeTransfers && tx.nativeTransfers.length > 0 && from !== "Unknown" && to !== "Unknown") {
            const outgoingFromBuyer = tx.nativeTransfers
                .filter(t => t.fromUserAccount === to && t.toUserAccount !== to)
                .reduce((sum, t) => sum + (t.amount || 0), 0) / 1e9;
            const incomingToSeller = tx.nativeTransfers
                .filter(t => t.toUserAccount === from && t.fromUserAccount !== from)
                .reduce((sum, t) => sum + (t.amount || 0), 0) / 1e9;
            calculatedPrice = Math.max(outgoingFromBuyer, incomingToSeller);
        }

        // Use event price if available, otherwise calculated price
        if (eventPrice > 0) {
            if (!isBatch && calculatedPrice > eventPrice && calculatedPrice < eventPrice * 1.25) {
                price = calculatedPrice;
            } else {
                price = eventPrice;
            }
        } else {
            price = calculatedPrice;
        }

        // 5. Update Tier based on source
        if (tier < 3 && price > 0) {
            const source = tx.source || "UNKNOWN";
            if (MARKETPLACES.has(source)) {
                tier = 2;
            }
        }

        if (price > 0) {
            candidates.push({
                date: new Date((tx.timestamp || 0) * 1000).toISOString(),
                price,
                from,
                to,
                signature: tx.signature || "Unknown",
                tier,
                timestamp: tx.timestamp || 0
            });
        }
    }

    // Lower threshold to catch cheap collections/pools (0.005 SOL)
    const MIN_SALE_THRESHOLD = 0.005;

    // Sort by tier (highest first), then by timestamp (newest first)
    const tiersFound = Array.from(new Set(candidates.map(c => c.tier))).sort((a, b) => b - a);

    for (const topTier of tiersFound) {
        let tierCandidates = candidates.filter(c => c.tier === topTier);

        if (topTier < 3) {
            // Filter noise for low-confidence tiers
            tierCandidates = tierCandidates.filter(c => c.price >= MIN_SALE_THRESHOLD);
        }

        if (tierCandidates.length > 0) {
            // Sort by recency and return the newest from the highest occupied tier
            const winner = tierCandidates.sort((a, b) => b.timestamp - a.timestamp)[0];

            console.log(`[DEBUG] Extraction Winner - Tier: ${topTier}, Price: ${winner.price}, Sig: ${winner.signature.substring(0, 8)}...`);

            return {
                date: winner.date,
                price: winner.price,
                from: winner.from,
                to: winner.to,
                signature: winner.signature
            };
        }
    }

    // Final Fallback: Return most recent tx with 0 price
    const lastTx = transactions[0];
    return {
        date: new Date((lastTx.timestamp || 0) * 1000).toISOString(),
        price: 0,
        from: lastTx.feePayer || "Unknown",
        to: "Unknown",
        signature: lastTx.signature || "Unknown",
    };
}

/**
 * Main function to get last sale for an NFT
 * First tries the NFT_SALE filter, then falls back to general history parsing
 */
export async function getLastSaleForNFT(nftMintAddress: string): Promise<{
    date: string;
    price: number;
    from: string;
    to: string;
    signature: string;
} | null> {
    // First, try to get sales using the NFT_SALE type filter (most reliable)
    const saleHistory = await fetchNFTSaleHistory(nftMintAddress);
    
    if (saleHistory.length > 0) {
        const lastSale = extractLastSaleFromSaleHistory(saleHistory, nftMintAddress);
        if (lastSale && lastSale.price > 0) {
            return lastSale;
        }
    }

    // Fallback: Parse general transaction history
    const generalHistory = await fetchNFTTransactionHistory(nftMintAddress);
    return extractLastSale(generalHistory, nftMintAddress);
}

/**
 * Get the purchase price for the CURRENT OWNER of an NFT
 * This is specifically for detecting "lucky buys" - what the current holder paid
 * 
 * @param nftMintAddress - The NFT mint address
 * @param currentOwner - The current owner's wallet address
 * @returns The sale where currentOwner was the buyer, or null if not found
 */
export async function getOwnerPurchasePrice(
    nftMintAddress: string,
    currentOwner: string
): Promise<{
    date: string;
    price: number;
    from: string;
    to: string;
    signature: string;
} | null> {
    // Fetch sales using the NFT_SALE type filter
    const saleHistory = await fetchNFTSaleHistory(nftMintAddress);
    
    if (saleHistory.length === 0) {
        // Fallback to general history
        const generalHistory = await fetchNFTTransactionHistory(nftMintAddress);
        return findOwnerPurchaseInHistory(generalHistory, nftMintAddress, currentOwner);
    }
    
    // Find the sale where the current owner was the buyer
    for (const tx of saleHistory) {
        if (tx.type !== "NFT_SALE") continue;
        
        const nftEvent = tx.events?.nft;
        if (!nftEvent) continue;
        
        // Check if the current owner was the buyer in this transaction
        const buyer = nftEvent.buyer;
        if (buyer && buyer.toLowerCase() === currentOwner.toLowerCase()) {
            const price = (nftEvent.amount || 0) / 1e9;
            if (price > 0) {
                console.log(`[DEBUG] Found owner purchase - Price: ${price} SOL, Owner: ${currentOwner.substring(0, 8)}...`);
                return {
                    date: new Date((tx.timestamp || 0) * 1000).toISOString(),
                    price,
                    from: nftEvent.seller || "Unknown",
                    to: buyer,
                    signature: tx.signature,
                };
            }
        }
    }
    
    // If not found in NFT_SALE transactions, try general history
    const generalHistory = await fetchNFTTransactionHistory(nftMintAddress);
    return findOwnerPurchaseInHistory(generalHistory, nftMintAddress, currentOwner);
}

/**
 * Helper to find owner's purchase in general transaction history
 */
function findOwnerPurchaseInHistory(
    transactions: HeliusTransaction[],
    targetMint: string,
    currentOwner: string
): {
    date: string;
    price: number;
    from: string;
    to: string;
    signature: string;
} | null {
    const SALE_TYPES = new Set(["NFT_SALE", "NFT_MINT", "NFT_AUCTION_SETTLED"]);
    
    for (const tx of transactions) {
        // Check NFT event first
        if (tx.events?.nft) {
            const nftEvent = tx.events.nft;
            const eventType = nftEvent.type || tx.type;
            
            if (SALE_TYPES.has(eventType)) {
                const buyer = nftEvent.buyer;
                if (buyer && buyer.toLowerCase() === currentOwner.toLowerCase()) {
                    const price = (nftEvent.amount || 0) / 1e9;
                    if (price > 0) {
                        return {
                            date: new Date((tx.timestamp || 0) * 1000).toISOString(),
                            price,
                            from: nftEvent.seller || "Unknown",
                            to: buyer,
                            signature: tx.signature,
                        };
                    }
                }
            }
        }
        
        // Check token transfers - look for transfer TO the current owner
        const nftTransfer = tx.tokenTransfers?.find(t => t.mint === targetMint);
        if (nftTransfer && nftTransfer.toUserAccount?.toLowerCase() === currentOwner.toLowerCase()) {
            // This NFT was transferred to the current owner
            // Try to find associated payment
            const from = nftTransfer.fromUserAccount || "Unknown";
            const to = nftTransfer.toUserAccount;
            
            // Look for SOL payment from buyer (current owner) to seller
            let price = 0;
            if (tx.nativeTransfers && tx.nativeTransfers.length > 0) {
                const payment = tx.nativeTransfers
                    .filter(t => t.fromUserAccount?.toLowerCase() === currentOwner.toLowerCase())
                    .reduce((sum, t) => sum + (t.amount || 0), 0) / 1e9;
                
                if (payment > 0.001) { // Filter out dust
                    price = payment;
                }
            }
            
            if (price > 0) {
                return {
                    date: new Date((tx.timestamp || 0) * 1000).toISOString(),
                    price,
                    from,
                    to,
                    signature: tx.signature,
                };
            }
        }
    }
    
    return null;
}
