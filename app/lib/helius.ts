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

    console.log(`[Helius] Fetching NFT_SALE history for mint: ${nftMintAddress}`);

    // Fetch up to 5 pages (500 txs) of NFT_SALE transactions
    // Need more pages because staking/unstaking can push sales further back
    for (let i = 0; i < 5; i++) {
        let url = `https://api.helius.xyz/v0/addresses/${nftMintAddress}/transactions?api-key=${HELIUS_API_KEY}&type=NFT_SALE`;
        if (lastSignature) url += `&before=${lastSignature}`;

        let response: Response | null = null;
        let attempts = 0;

        while (attempts < 3) {
            try {
                response = await fetch(url);
                console.log(`[Helius] NFT_SALE page ${i+1} response status: ${response.status} for ${nftMintAddress.substring(0, 8)}...`);
                if (response.ok) break;
                if (response.status === 429 || response.status >= 500) {
                    // Wait and retry
                    console.log(`[Helius] Rate limited or server error, retrying...`);
                    await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempts)));
                    attempts++;
                } else {
                    console.warn(`[Helius] Fatal error ${response.status} for ${nftMintAddress}`);
                    break; // Fatal error (400, 401, 404)
                }
            } catch (err) {
                console.error(`[Helius] Fetch error for ${nftMintAddress}:`, err);
                attempts++;
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        if (!response || !response.ok) {
            console.warn(`[Helius] Failed to fetch NFT_SALE history for ${nftMintAddress}: ${response?.status}`);
            break;
        }

        const transactions = await response.json();
        console.log(`[Helius] NFT_SALE page ${i+1} returned ${Array.isArray(transactions) ? transactions.length : 0} transactions for ${nftMintAddress.substring(0, 8)}...`);
        
        if (!Array.isArray(transactions) || transactions.length === 0) {
            console.log(`[Helius] No more NFT_SALE transactions for ${nftMintAddress.substring(0, 8)}...`);
            break;
        }

        // Log first transaction details for debugging
        if (i === 0 && transactions.length > 0) {
            const firstTx = transactions[0];
            console.log(`[Helius] First NFT_SALE tx: type=${firstTx.type}, source=${firstTx.source}, sig=${firstTx.signature?.substring(0, 8)}...`);
            if (firstTx.events?.nft) {
                console.log(`[Helius] NFT event: amount=${firstTx.events.nft.amount}, buyer=${firstTx.events.nft.buyer?.substring(0, 8)}..., seller=${firstTx.events.nft.seller?.substring(0, 8)}...`);
            }
        }

        allTransactions.push(...transactions);
        lastSignature = transactions[transactions.length - 1].signature;

        // If we got less than 100, we've reached the end
        if (transactions.length < 100) break;
        
        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 100));
    }

    console.log(`[Helius] Total NFT_SALE transactions found: ${allTransactions.length} for ${nftMintAddress.substring(0, 8)}...`);
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

    console.log(`[Helius] Fetching general tx history for mint: ${nftMintAddress.substring(0, 8)}...`);

    // Fetch up to 3 pages (300 txs) to find sales that might be buried
    for (let i = 0; i < 3; i++) {
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
            console.warn(`[Helius] Failed to fetch tx history for ${nftMintAddress}: ${response?.status}`);
            break;
        }

        const transactions = await response.json();
        if (!Array.isArray(transactions) || transactions.length === 0) {
            console.log(`[Helius] No more transactions for ${nftMintAddress.substring(0, 8)}...`);
            break;
        }

        // Log what types of transactions we're getting
        if (i === 0) {
            const typeCounts: Record<string, number> = {};
            for (const tx of transactions) {
                typeCounts[tx.type] = (typeCounts[tx.type] || 0) + 1;
            }
            console.log(`[Helius] General history page 1 for ${nftMintAddress.substring(0, 8)}... - Types:`, JSON.stringify(typeCounts));
        }

        allTransactions.push(...transactions);
        lastSignature = transactions[transactions.length - 1].signature;

        if (transactions.length < 100) break;
        
        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 100));
    }

    console.log(`[Helius] Total general transactions: ${allTransactions.length} for ${nftMintAddress.substring(0, 8)}...`);
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
 * 
 * IMPORTANT: Mpl Core NFTs (like Goblins, Defi Dungeons) don't get tagged as NFT_SALE
 * Purchases show as "deposit" with significant SOL movement
 * We need to distinguish actual sales from staking rewards, collects, etc.
 */
const MARKETPLACES = new Set([
    "MAGIC_EDEN",
    "MAGIC_EDEN_V2", 
    "TENSOR",
    "TENSORSWAP",
    "SOLANART",
    "OPENSEA",
    "SNIPER",
    "CORAL_CUBE",
    "HADESWAP",
    "YAWWW",
    "ME", // Magic Eden shorthand
    "MPL_CORE" // Mpl Core marketplace interactions
]);

// Types that are DEFINITELY not sales - skip entirely
// NOTE: Be careful not to over-filter - Mpl Core transactions can have unusual types
const IGNORE_TYPES = new Set([
    "NFT_BID",
    "NFT_BID_CANCELLED",
    "NFT_LISTING",
    "NFT_CANCEL_LISTING",
    "NFT_OFFER",
    "NFT_OFFER_CANCELLED",
    "UPDATEV1", // Plugin updates, not sales
    "UPDATEPLUGINV1",
    "ADDPLUGINV1",
    "CREATEV1", // NFT creation/mint (not a sale in secondary market sense)
    // NOTE: TRANSFERV1 removed - it might have SOL movement indicating a real sale
]);

// Types that are LIKELY actual marketplace sales
const HIGH_CONFIDENCE_SALE_TYPES = new Set([
    "NFT_SALE",
    "COMPRESSED_NFT_SALE",
    "EXECUTE_SALE",
    "BUY",
    "COREBUY", // Mpl Core buy
    "CORESELL", // Mpl Core sell
]);

// Types that MIGHT be sales if they have significant SOL movement
const POTENTIAL_SALE_TYPES = new Set([
    "DEPOSIT", // Mpl Core purchases often show as deposit
    "TRANSFERV1", // Might be a sale with SOL movement
    "TRANSFER", // Might be a sale with SOL movement  
    "SWAP", // Some AMM sales
    "NFT_MINT", 
    "NFT_AUCTION_SETTLED",
    "UNKNOWN", // Unknown types with SOL movement could be sales
]);

// Types that are usually NOT sales even with SOL movement
const LOW_CONFIDENCE_TYPES = new Set([
    "COLLECT", // Usually staking rewards
    "CLAIM",
    "WITHDRAW",
    "STAKE",
    "UNSTAKE",
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

    console.log(`[extractLastSale] Analyzing ${transactions.length} transactions for ${targetMint.substring(0, 8)}...`);

    // Scan ALL transactions to find candidates
    const candidates: Array<{
        date: string;
        price: number;
        from: string;
        to: string;
        signature: string;
        tier: number; // 6: NFT_SALE event, 5: High confidence type, 4: Deposit with big SOL, 3: Marketplace, 2: Low confidence
        timestamp: number;
        type: string;
    }> = [];

    for (const tx of transactions) {
        const txType = (tx.type || "UNKNOWN").toUpperCase();
        
        // Skip definitely non-sale types
        if (IGNORE_TYPES.has(txType)) {
            continue;
        }

        let price = 0;
        let from = "Unknown";
        let to = "Unknown";
        let tier = 1;
        
        const source = (tx.source || "UNKNOWN").toUpperCase();
        const isMarketplace = MARKETPLACES.has(source);
        const isHighConfidenceType = HIGH_CONFIDENCE_SALE_TYPES.has(txType);
        const isPotentialSaleType = POTENTIAL_SALE_TYPES.has(txType);
        const isLowConfidenceType = LOW_CONFIDENCE_TYPES.has(txType);

        // 1. Check for explicit NFT_SALE type with nft event (highest priority)
        if (txType === "NFT_SALE" && tx.events?.nft) {
            const nftEvent = tx.events.nft;
            price = (nftEvent.amount || 0) / 1e9;
            from = nftEvent.seller || "Unknown";
            to = nftEvent.buyer || "Unknown";
            
            if (price > 0) {
                console.log(`[extractLastSale] Found NFT_SALE event: ${price} SOL, sig=${tx.signature?.substring(0, 8)}...`);
                candidates.push({
                    date: new Date((tx.timestamp || 0) * 1000).toISOString(),
                    price,
                    from,
                    to,
                    signature: tx.signature || "Unknown",
                    tier: 6,
                    timestamp: tx.timestamp || 0,
                    type: txType
                });
                continue;
            }
        }

        // 2. Check for NFT event amount (even without NFT_SALE type)
        if (tx.events?.nft?.amount) {
            price = (tx.events.nft.amount || 0) / 1e9;
            from = tx.events.nft.seller || from;
            to = tx.events.nft.buyer || to;
            if (price > 0) {
                tier = 5;
            }
        }

        // 3. Calculate SOL movement from native transfers
        let totalSolMovement = 0;
        let buyerAddress = "";
        let sellerAddress = "";
        
        if (tx.nativeTransfers && tx.nativeTransfers.length > 0) {
            // Find the largest SOL transfer (likely the sale price)
            for (const transfer of tx.nativeTransfers) {
                const amount = (transfer.amount || 0) / 1e9;
                if (amount > totalSolMovement) {
                    totalSolMovement = amount;
                    buyerAddress = transfer.fromUserAccount || "";
                    sellerAddress = transfer.toUserAccount || "";
                }
            }
        }

        // 4. Get NFT transfer info
        const nftTransfer = tx.tokenTransfers?.find(t => t.mint === targetMint);
        if (nftTransfer) {
            from = nftTransfer.fromUserAccount || from;
            to = nftTransfer.toUserAccount || to;
        }

        // 5. Determine tier based on transaction characteristics
        const hasSignificantSol = totalSolMovement >= 0.03; // Lowered to 0.03 SOL to catch cheaper NFTs
        const hasLargeSol = totalSolMovement >= 0.3; // Lowered to 0.3 SOL
        
        // Use SOL movement as price if we don't have event price
        if (price === 0 && totalSolMovement > 0) {
            price = totalSolMovement;
        }
        
        // Update from/to with buyer/seller from SOL transfer if not set
        if (from === "Unknown" && sellerAddress) from = sellerAddress;
        if (to === "Unknown" && buyerAddress) to = buyerAddress;

        // Log all transactions with any SOL movement for debugging
        if (totalSolMovement > 0.01) {
            console.log(`[extractLastSale] TX: type=${txType}, source=${source}, sol=${totalSolMovement.toFixed(4)}, from=${from?.substring(0,8)}..., to=${to?.substring(0,8)}...`);
        }

        // Assign tier based on confidence
        if (isHighConfidenceType && price > 0) {
            tier = Math.max(tier, 5);
        } else if (txType === "DEPOSIT" && hasLargeSol) {
            // DEPOSIT with large SOL is almost certainly a purchase
            tier = Math.max(tier, 5);
        } else if (txType === "DEPOSIT" && hasSignificantSol) {
            tier = Math.max(tier, 4);
        } else if ((txType === "TRANSFERV1" || txType === "TRANSFER") && hasSignificantSol) {
            // Transfer with significant SOL could be a sale
            tier = Math.max(tier, 3);
        } else if (isMarketplace && price > 0) {
            tier = Math.max(tier, 4);
        } else if (isPotentialSaleType && hasSignificantSol) {
            tier = Math.max(tier, 3);
        } else if (isLowConfidenceType) {
            // collect, claim, etc. - only consider if large amount
            if (hasLargeSol) {
                tier = 2; // Still low tier
            } else {
                continue; // Skip small collect/claim transactions
            }
        } else if (price > 0.03) {
            // Any transaction with decent SOL movement
            tier = 2;
        }

        // Only add if we found a meaningful price and tier
        if (price > 0.005 && tier >= 2) { // Lowered from 0.01 to 0.005
            console.log(`[extractLastSale] Candidate: type=${txType}, source=${source}, price=${price.toFixed(4)} SOL, tier=${tier}, sig=${tx.signature?.substring(0, 8)}...`);
            candidates.push({
                date: new Date((tx.timestamp || 0) * 1000).toISOString(),
                price,
                from,
                to,
                signature: tx.signature || "Unknown",
                tier,
                timestamp: tx.timestamp || 0,
                type: txType
            });
        }
    }

    console.log(`[extractLastSale] Found ${candidates.length} sale candidates`);

    if (candidates.length === 0) {
        return null;
    }

    // Sort by tier (highest first), then by TIMESTAMP (newest first)
    // We want the LAST sale, not the biggest sale!
    candidates.sort((a, b) => {
        if (b.tier !== a.tier) return b.tier - a.tier;
        // For same tier, prefer NEWEST (most recent transaction)
        return b.timestamp - a.timestamp;
    });

    const winner = candidates[0];
    console.log(`[extractLastSale] Winner: type=${winner.type}, tier=${winner.tier}, price=${winner.price.toFixed(4)} SOL, date=${winner.date}, sig=${winner.signature.substring(0, 8)}...`);

    return {
        date: winner.date,
        price: winner.price,
        from: winner.from,
        to: winner.to,
        signature: winner.signature
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
    console.log(`[getLastSaleForNFT] Starting lookup for ${nftMintAddress.substring(0, 8)}...`);
    
    // First, try to get sales using the NFT_SALE type filter (most reliable)
    const saleHistory = await fetchNFTSaleHistory(nftMintAddress);
    
    if (saleHistory.length > 0) {
        console.log(`[getLastSaleForNFT] Found ${saleHistory.length} NFT_SALE transactions, extracting...`);
        const lastSale = extractLastSaleFromSaleHistory(saleHistory, nftMintAddress);
        if (lastSale && lastSale.price > 0) {
            console.log(`[getLastSaleForNFT] SUCCESS from NFT_SALE: price=${lastSale.price}, from=${lastSale.from.substring(0, 8)}..., to=${lastSale.to.substring(0, 8)}...`);
            return lastSale;
        }
        console.log(`[getLastSaleForNFT] NFT_SALE extraction returned no valid sale`);
    } else {
        console.log(`[getLastSaleForNFT] No NFT_SALE transactions found, trying general history...`);
    }

    // Fallback: Parse general transaction history
    const generalHistory = await fetchNFTTransactionHistory(nftMintAddress);
    console.log(`[getLastSaleForNFT] General history returned ${generalHistory.length} transactions`);
    
    const result = extractLastSale(generalHistory, nftMintAddress);
    if (result) {
        console.log(`[getLastSaleForNFT] General extraction: price=${result.price}, from=${result.from.substring(0, 8)}..., to=${result.to.substring(0, 8)}...`);
    } else {
        console.log(`[getLastSaleForNFT] No sale found in general history`);
    }
    
    return result;
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
