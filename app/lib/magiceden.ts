import { MAGIC_EDEN_API_BASE, MAGIC_EDEN_API_KEY } from "./constants";
import { getTensorFloorPrice } from "./tensor";

// Magic Eden listing data
export interface MagicEdenListing {
    price: number;
    tokenMint: string;
    seller: string;
    tokenAddress?: string;
    pdaAddress?: string;
    auctionHouse?: string;
    expiry?: number;
    token?: {
        mintAddress?: string;
        name?: string;
        image?: string;
        collection?: string;
        attributes?: Array<{
            trait_type: string;
            value: string;
        }>;
    };
    // Attributes may be at top level or nested in token
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

// Collection symbol lookup cache
const symbolCache = new Map<string, string | null>();

/**
 * Generate possible Magic Eden symbol variations from collection name
 * Magic Eden symbols are typically lowercase, use underscores, and are human-readable
 */
function generateSymbolVariations(collectionName: string, collectionSymbol?: string): string[] {
    const variations: string[] = [];
    
    // If we have an explicit symbol from metadata, try it first
    if (collectionSymbol) {
        variations.push(collectionSymbol.toLowerCase());
        variations.push(collectionSymbol.toLowerCase().replace(/\s+/g, "_"));
        variations.push(collectionSymbol.toLowerCase().replace(/\s+/g, "-"));
        variations.push(collectionSymbol.toLowerCase().replace(/[^a-z0-9]/g, ""));
    }
    
    // Generate from collection name
    const cleanName = collectionName.trim();
    
    // Standard lowercase with underscores (most common format)
    variations.push(cleanName.toLowerCase().replace(/\s+/g, "_"));
    
    // Lowercase with hyphens
    variations.push(cleanName.toLowerCase().replace(/\s+/g, "-"));
    
    // Lowercase no spaces
    variations.push(cleanName.toLowerCase().replace(/\s+/g, ""));
    
    // Remove special characters
    variations.push(cleanName.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, "_"));
    variations.push(cleanName.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, ""));
    
    // Try without numbers at the end (some collections)
    const noTrailingNumbers = cleanName.replace(/\s*\d+$/, "").trim();
    if (noTrailingNumbers !== cleanName) {
        variations.push(noTrailingNumbers.toLowerCase().replace(/\s+/g, "_"));
        variations.push(noTrailingNumbers.toLowerCase().replace(/\s+/g, ""));
    }
    
    // Remove duplicates while preserving order
    return [...new Set(variations)];
}

/**
 * Try to find the correct Magic Eden symbol by testing variations
 * Returns the working symbol or null if not found
 */
async function findWorkingSymbol(
    collectionName: string,
    collectionSymbol?: string,
    collectionId?: string
): Promise<string | null> {
    // Check cache first
    const cacheKey = `${collectionName}|${collectionSymbol}|${collectionId}`;
    if (symbolCache.has(cacheKey)) {
        return symbolCache.get(cacheKey) || null;
    }
    
    const variations = generateSymbolVariations(collectionName, collectionSymbol);
    
    // Also try the collection ID directly (some collections use this)
    if (collectionId && !variations.includes(collectionId.toLowerCase())) {
        variations.push(collectionId.toLowerCase());
    }
    
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };
    if (MAGIC_EDEN_API_KEY) {
        headers["Authorization"] = `Bearer ${MAGIC_EDEN_API_KEY}`;
    }
    
    for (const symbol of variations) {
        try {
            const response = await fetch(
                `${MAGIC_EDEN_API_BASE}/collections/${symbol}/stats`,
                { headers }
            );
            
            if (response.ok) {
                const stats = await response.json();
                // Verify we got valid data
                if (stats && (stats.floorPrice !== undefined || stats.listedCount !== undefined)) {
                    console.log(`[ME] Found working symbol: ${symbol} for "${collectionName}"`);
                    symbolCache.set(cacheKey, symbol);
                    return symbol;
                }
            }
            
            // Small delay to avoid rate limiting
            await new Promise(r => setTimeout(r, 100));
        } catch {
            // Continue to next variation
        }
    }
    
    console.warn(`[ME] Could not find working symbol for "${collectionName}" (tried: ${variations.slice(0, 5).join(", ")}...)`);
    symbolCache.set(cacheKey, null);
    return null;
}

/**
 * Fetch collection statistics from Magic Eden
 */
export async function fetchCollectionStats(
    collectionSymbol: string
): Promise<CollectionStats | null> {
    try {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };
        if (MAGIC_EDEN_API_KEY) {
            headers["Authorization"] = `Bearer ${MAGIC_EDEN_API_KEY}`;
        }
        
        const response = await fetch(
            `${MAGIC_EDEN_API_BASE}/collections/${collectionSymbol}/stats`,
            { headers }
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
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };
        if (MAGIC_EDEN_API_KEY) {
            headers["Authorization"] = `Bearer ${MAGIC_EDEN_API_KEY}`;
        }
        
        const response = await fetch(
            `${MAGIC_EDEN_API_BASE}/collections/${collectionSymbol}/listings?limit=${limit}`,
            { headers }
        );

        if (!response.ok) {
            const errText = await response.text().catch(() => "Unknown");
            console.warn(`Magic Eden API error for ${collectionSymbol}: ${response.status} - ${errText}`);
            return [];
        }

        const listings = await response.json();
        return Array.isArray(listings) ? listings : [];
    } catch (error) {
        console.error(`Error fetching collection listings for ${collectionSymbol}:`, error);
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
        const price = listing.price; // Price is in SOL
        
        // Attributes can be at top level or nested in token object
        const attributes = listing.attributes || listing.token?.attributes || [];

        for (const attr of attributes) {
            if (!attr.trait_type || attr.value === undefined) continue;
            
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

/**
 * Smart collection data fetcher that tries Magic Eden first, then Tensor as fallback
 * Returns floor price, listings, and trait data
 */
export async function getCollectionData(
    collectionName: string,
    collectionSymbol?: string,
    collectionId?: string
): Promise<{
    symbol: string | null;
    floorPrice: number;
    listings: MagicEdenListing[];
    traitFloors: TraitFloorMap;
    source: "magiceden" | "tensor" | "none";
}> {
    // First, try Magic Eden
    const workingSymbol = await findWorkingSymbol(collectionName, collectionSymbol, collectionId);
    
    if (workingSymbol) {
        // Fetch floor price from Magic Eden
        const floorPrice = await getCollectionFloor(workingSymbol);
        
        // Fetch listings for trait analysis
        const listings = await fetchCollectionListings(workingSymbol);
        
        // Build trait floor map
        const traitFloors = buildTraitFloorMap(listings);
        
        return {
            symbol: workingSymbol,
            floorPrice,
            listings,
            traitFloors,
            source: "magiceden",
        };
    }
    
    // Fallback to Tensor if Magic Eden doesn't have the collection
    // Tensor uses the collection's on-chain ID directly (which we have from Helius)
    if (collectionId && collectionId !== "Unknown") {
        try {
            const tensorFloor = await getTensorFloorPrice(collectionId);
            
            if (tensorFloor > 0) {
                console.log(`[ME→Tensor] Fallback successful for "${collectionName}": ${tensorFloor.toFixed(2)} SOL`);
                return {
                    symbol: null,
                    floorPrice: tensorFloor,
                    listings: [], // Tensor free API doesn't provide listings
                    traitFloors: new Map(), // No trait data without listings
                    source: "tensor",
                };
            }
        } catch (error) {
            console.error(`[Tensor] Fallback error for ${collectionName}:`, error);
        }
    }
    
    // If collection ID is Unknown, try Tensor with collection name as a last resort
    // Some collections can be looked up by their slug which may match the name
    if (collectionId === "Unknown" || !collectionId) {
        const nameVariations = [
            collectionName.toLowerCase().replace(/\s+/g, "_"),
            collectionName.toLowerCase().replace(/\s+/g, ""),
            collectionName.toLowerCase().replace(/\s+/g, "-"),
        ];
        
        for (const nameSlug of nameVariations) {
            try {
                const tensorFloor = await getTensorFloorPrice(nameSlug);
                if (tensorFloor > 0) {
                    console.log(`[Tensor] Name-based lookup successful for "${collectionName}" -> "${nameSlug}": ${tensorFloor.toFixed(2)} SOL`);
                    return {
                        symbol: nameSlug,
                        floorPrice: tensorFloor,
                        listings: [],
                        traitFloors: new Map(),
                        source: "tensor",
                    };
                }
            } catch {
                // Continue to next variation
            }
        }
    }
    
    // Neither Magic Eden nor Tensor has this collection
    return {
        symbol: null,
        floorPrice: 0,
        listings: [],
        traitFloors: new Map(),
        source: "none",
    };
}

/**
 * Clear the symbol cache (useful for testing or when you need fresh data)
 */
export function clearSymbolCache(): void {
    symbolCache.clear();
}
