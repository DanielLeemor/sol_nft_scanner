import { MAGIC_EDEN_API_BASE, MAGIC_EDEN_API_KEY } from "./constants";

// Magic Eden listing data
export interface MagicEdenListing {
    price: number;
    tokenMint: string;
    seller: string;
    attributes?: Array<{
        trait_type: string;
        value: string;
    }>;
}

// Collection stats from Magic Eden
export interface CollectionStats {
    symbol: string;
    floorPrice: number; // In lamports
    listedCount: number;
    avgPrice24hr: number;
    volumeAll: number;
}

// Trait floor map
export type TraitFloorMap = Map<string, number>;

/**
 * Fetch collection statistics from Magic Eden
 */
export async function fetchCollectionStats(
    collectionSymbol: string
): Promise<CollectionStats | null> {
    try {
        const response = await fetch(
            `${MAGIC_EDEN_API_BASE}/collections/${collectionSymbol}/stats`,
            {
                headers: {
                    "Content-Type": "application/json",
                    ...(MAGIC_EDEN_API_KEY ? { Authorization: `Bearer ${MAGIC_EDEN_API_KEY}` } : {}),
                },
            }
        );

        if (!response.ok) {
            console.warn(`Failed to fetch stats for ${collectionSymbol}: ${response.status}`);
            return null;
        }

        const stats = await response.json();
        return stats;
    } catch (error) {
        console.error(`Error fetching collection stats:`, error);
        return null;
    }
}

/**
 * Fetch all listings for a collection from Magic Eden
 */
export async function fetchCollectionListings(
    collectionSymbol: string,
    limit: number = 500
): Promise<MagicEdenListing[]> {
    try {
        const response = await fetch(
            `${MAGIC_EDEN_API_BASE}/collections/${collectionSymbol}/listings?limit=${limit}`,
            {
                headers: {
                    "Content-Type": "application/json",
                    ...(MAGIC_EDEN_API_KEY ? { Authorization: `Bearer ${MAGIC_EDEN_API_KEY}` } : {}),
                },
            }
        );

        if (!response.ok) {
            console.warn(`Failed to fetch listings for ${collectionSymbol}: ${response.status}`);
            return [];
        }

        const listings = await response.json();
        return Array.isArray(listings) ? listings : [];
    } catch (error) {
        console.error(`Error fetching collection listings:`, error);
        return [];
    }
}

/**
 * Build trait floor map from listings
 * This calculates the lowest price for each trait combination
 */
export function buildTraitFloorMap(listings: MagicEdenListing[]): TraitFloorMap {
    const traitFloors = new Map<string, number>();

    for (const listing of listings) {
        const price = listing.price; // Already in SOL
        const attributes = listing.attributes || [];

        for (const attr of attributes) {
            const traitKey = `${attr.trait_type}: ${attr.value}`;
            const currentFloor = traitFloors.get(traitKey);

            if (currentFloor === undefined || price < currentFloor) {
                traitFloors.set(traitKey, price);
            }
        }
    }

    return traitFloors;
}

/**
 * Analyze an NFT's traits against the trait floor map
 * Returns the highest valued trait and count of traits with no listings
 */
export function analyzeNftTraits(
    nftAttributes: Array<{ trait_type: string; value: string }> | undefined,
    traitFloors: TraitFloorMap
): {
    highestTraitPrice: number;
    highestTraitName: string;
    zeroCount: number;
} {
    let highestTraitPrice = 0;
    let highestTraitName = "No traits found";
    let zeroCount = 0;

    if (!nftAttributes || nftAttributes.length === 0) {
        return { highestTraitPrice, highestTraitName, zeroCount };
    }

    for (const attr of nftAttributes) {
        const traitKey = `${attr.trait_type}: ${attr.value}`;
        const traitPrice = traitFloors.get(traitKey);

        if (traitPrice === undefined) {
            zeroCount++; // No listings for this trait
        } else if (traitPrice > highestTraitPrice) {
            highestTraitPrice = traitPrice;
            highestTraitName = traitKey;
        }
    }

    return { highestTraitPrice, highestTraitName, zeroCount };
}

/**
 * Get collection floor price in SOL
 */
export async function getCollectionFloor(
    collectionSymbol: string
): Promise<number> {
    const stats = await fetchCollectionStats(collectionSymbol);

    if (!stats || !stats.floorPrice) {
        return 0;
    }

    // Convert lamports to SOL
    return stats.floorPrice / 1e9;
}
