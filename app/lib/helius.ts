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

// Transaction data from Helius
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
        };
    };
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
    const response = await fetch(HELIUS_RPC_URL, {
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

    if (!response.ok) {
        throw new Error(`Helius Batch API error: ${response.status}`);
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
 * Fetch transaction history for an NFT (last sale data)
 */
export async function fetchNFTTransactionHistory(
    nftMintAddress: string
): Promise<HeliusTransaction[]> {
    const allTransactions: HeliusTransaction[] = [];
    let lastSignature: string | null = null;

    // Fetch up to 500 transactions (5 pages) to catch older sale events
    for (let i = 0; i < 5; i++) {
        let url = `https://api.helius.xyz/v0/addresses/${nftMintAddress}/transactions?api-key=${HELIUS_API_KEY}`;
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
            console.warn(`Failed to fetch tx history for ${nftMintAddress}: ${response?.status}`);
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
 * Extract last sale data from transaction history
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

export function extractLastSale(transactions: HeliusTransaction[]): {
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
        tier: number; // 4: Explicit, 3: NFT Event, 2: Marketplace, 1: Unknown
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
        "NFT_OFFER_CANCELLED"
    ]);

    for (const tx of transactions) {
        // Root-level filter: If the transaction itself is a bid/listing, skip everything.
        if (IGNORE_TYPES.has(tx.type)) {
            continue;
        }

        let price = 0; // This will be the final determined price for this transaction
        let from = "Unknown";
        let to = "Unknown";
        let tier = 1;

        // 1. Check for explicit NFT event amount (Priority 1)
        // High confidence types that represent a REAL sale/mint.
        let eventPrice = 0;

        if (tx.events?.nft && tx.events.nft.amount) {
            const eventType = tx.events.nft.type || tx.type;
            if (SALE_TYPES.has(eventType)) {
                eventPrice = (tx.events.nft.amount || 0) / 1e9;
                from = tx.events.nft.seller || from;
                to = tx.events.nft.buyer || to;
                tier = tx.type === "NFT_SALE" ? 4 : 3;
            } else {
                // If it's a known non-sale type, we ignore the amount
                // But we can still use the to/from as context if they are better than "Unknown"
                if (from === "Unknown") from = tx.events.nft.seller || from;
                if (to === "Unknown") to = tx.events.nft.buyer || to;
            }
        }

        // 2. Calculate total native SOL transfers for EACH transaction (to reconcile with eventPrice)
        // High quality data: we sum all outgoing SOL from each sender to find the largest "payout".
        let sumPrice = 0;
        let sumMainPayer = "unknown";
        let sumRecipient = "Unknown";

        if (tx.nativeTransfers && tx.nativeTransfers.length > 0) {
            const outgoing = new Map<string, number>();
            const largestTransferBySender = new Map<string, { to: string, amount: number }>();

            for (const t of tx.nativeTransfers) {
                const sender = t.fromUserAccount || "unknown";
                const amount = (t.amount || 0) / 1e9;
                outgoing.set(sender, (outgoing.get(sender) || 0) + amount);
                if (amount > (largestTransferBySender.get(sender)?.amount || 0)) {
                    largestTransferBySender.set(sender, { to: t.toUserAccount || "unknown", amount });
                }
            }

            let maxTotal = 0;
            let mainPayer = "unknown";
            for (const [sender, total] of outgoing.entries()) {
                if (total > maxTotal) {
                    maxTotal = total;
                    mainPayer = sender;
                }
            }

            if (maxTotal > 0.001) {
                sumPrice = maxTotal;
                sumMainPayer = mainPayer;
                sumRecipient = largestTransferBySender.get(mainPayer)?.to || "Unknown";
            }
        }

        // --- RECONCILIATION LOGIC ---
        // If we have an event price (Net usually) and a sum price (Gross usually),
        // we use the sum price if it's reasonably close (within 25% for royalties/fees).
        if (eventPrice > 0) {
            if (sumPrice > eventPrice && sumPrice < eventPrice * 1.25) {
                price = sumPrice; // Use Gross
            } else {
                price = eventPrice; // Stick to Net if Gross is too different (maybe unrelated transfers)
            }
        } else {
            price = sumPrice; // Fallback to Sum if no event
        }

        // Update To/From if found from sum logic
        if (to === "Unknown") to = sumMainPayer;
        if (from === "Unknown") from = sumRecipient;

        // 3. Identify Parties from Token Transfers if still unknown
        if ((from === "Unknown" || to === "Unknown") && tx.tokenTransfers && tx.tokenTransfers.length > 0) {
            from = tx.tokenTransfers[0].fromUserAccount || from;
            to = tx.tokenTransfers[0].toUserAccount || to;
        }

        // 4. Determine Tier if not already Tier 3/4
        if (tier < 3) {
            const source = tx.source || "UNKNOWN";
            if (MARKETPLACES.has(source)) {
                tier = 2;
            }
        }

        // 5. Add to candidates if we found a price
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

    const MIN_SALE_THRESHOLD = 0.05; // Ignore sub-0.05 SOL noise for low-confidence tiers

    // Comparison Strategy:
    // 1. Tier 4 (NFT_SALE) is the gold standard. If found, use the newest Tier 4.
    // 2. Tier 3 (NFT_MINT/AUCTION) is next.
    // 3. Tier 2/1 (Marketplace Interactions/Fallback) are only used if no higher tiers exist.
    //    For Tier 2/1, we only accept transactions above 0.05 SOL to avoid "noise".

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

            console.log(`[DEBUG] Extraction Winner - Tier: ${topTier}, Price: ${winner.price}, Sig: ${winner.signature}`);

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
