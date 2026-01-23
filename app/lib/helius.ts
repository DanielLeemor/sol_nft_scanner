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
    events: {
        nft?: {
            seller?: string;
            buyer?: string;
            amount?: number;
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
 * Group NFTs by collection
 */
export function groupNFTsByCollection(nfts: HeliusNFT[]): Map<string, CollectionGroup> {
    const collections = new Map<string, CollectionGroup>();

    for (const nft of nfts) {
        const collectionGrouping = nft.grouping?.find(g => g.group_key === "collection");
        const collectionId = collectionGrouping?.group_value || "Unknown";
        const collectionName = collectionGrouping?.collection_metadata?.name || collectionId;
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
    const response = await fetch(
        `https://api.helius.xyz/v0/addresses/${nftMintAddress}/transactions?api-key=${HELIUS_API_KEY}&type=NFT_SALE`,
        {
            method: "GET",
            headers: { "Content-Type": "application/json" },
        }
    );

    if (!response.ok) {
        // Return empty array on error - not all NFTs have transaction history
        return [];
    }

    const transactions = await response.json();
    return Array.isArray(transactions) ? transactions : [];
}

/**
 * Extract last sale data from transaction history
 */
export function extractLastSale(transactions: HeliusTransaction[]): {
    date: string;
    price: number;
    from: string;
    to: string;
} | null {
    if (!transactions || transactions.length === 0) {
        return null;
    }

    // Transactions are sorted by most recent
    const lastSale = transactions[0];
    const nftEvent = lastSale.events?.nft;

    if (!nftEvent) {
        return null;
    }

    return {
        date: new Date(lastSale.timestamp * 1000).toISOString(),
        price: (nftEvent.amount || 0) / 1e9, // Convert lamports to SOL
        from: nftEvent.seller || "Unknown",
        to: nftEvent.buyer || "Unknown",
    };
}
