import { MAGIC_EDEN_API_BASE, MAGIC_EDEN_API_KEY } from "./constants";
import { getTensorFloorPrice, fetchTensorListings } from "./tensor";



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

// Cache for mint -> collection symbol lookups
const mintToSymbolCache = new Map<string, string | null>();

/**
 * Get collection symbol directly from Magic Eden using an NFT's mint address
 * This is the MOST RELIABLE method - works for any collection!
 */
async function getCollectionSymbolFromMint(mintAddress: string): Promise<string | null> {
    // Check cache first
    if (mintToSymbolCache.has(mintAddress)) {
        return mintToSymbolCache.get(mintAddress) || null;
    }

    try {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };
        if (MAGIC_EDEN_API_KEY) {
            headers["Authorization"] = `Bearer ${MAGIC_EDEN_API_KEY}`;
        }

        // Magic Eden's token endpoint returns collection info
        const url = `${MAGIC_EDEN_API_BASE}/tokens/${mintAddress}`;
        console.log(`[ME] Looking up collection symbol via mint: ${mintAddress.substring(0, 8)}...`);

        const response = await fetch(url, { headers });

        if (!response.ok) {
            console.log(`[ME] Token lookup failed for ${mintAddress.substring(0, 8)}...: ${response.status}`);
            mintToSymbolCache.set(mintAddress, null);
            return null;
        }

        const data = await response.json();
        const symbol = data?.collection;

        if (symbol) {
            console.log(`[ME] Found collection symbol "${symbol}" from mint ${mintAddress.substring(0, 8)}...`);
            mintToSymbolCache.set(mintAddress, symbol);
            return symbol;
        }

        mintToSymbolCache.set(mintAddress, null);
        return null;
    } catch (error) {
        console.error(`[ME] Error looking up mint ${mintAddress}:`, error);
        mintToSymbolCache.set(mintAddress, null);
        return null;
    }
}




/**
 * Known collection name to Magic Eden symbol mappings
 * Some collections have symbols that don't match their names at all
 * Add mappings here when you discover them
 */
const KNOWN_SYMBOL_MAPPINGS: Record<string, string> = {
    // Goblins
    "goblins": "thatgoblin",
    "goblin": "thatgoblin",
    "that goblins": "thatgoblin",
    "thatgoblins": "thatgoblin",

    // Defi Dungeons
    "defi dungeons": "defi_dungeons",
    "defidungeons": "defi_dungeons",
    "defi_dungeons": "defi_dungeons",

    // Bozo
    "bozo": "bozo_collective",
    "bozo collective": "bozo_collective",
    "bozocollective": "bozo_collective",

    // CryptoTitans
    "cryptotitans": "crypto_titans",
    "crypto titans": "crypto_titans",
    "crypto_titans": "crypto_titans",

    // GigaBuds
    "gigabuds": "gigabuds",
    "giga buds": "gigabuds",
    "giga_buds": "gigabuds",

    // Primates
    "primate": "primate",
    "primates": "primate",
};

/**
 * Generate possible Magic Eden symbol variations from collection name
 * Magic Eden symbols are typically lowercase, use underscores, and are human-readable
 */
function generateSymbolVariations(collectionName: string, collectionSymbol?: string): string[] {
    const variations: string[] = [];

    // Check known mappings first
    const lowerName = collectionName.toLowerCase().trim();
    if (KNOWN_SYMBOL_MAPPINGS[lowerName]) {
        variations.push(KNOWN_SYMBOL_MAPPINGS[lowerName]);
    }

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

    console.log(`[ME] Trying ${variations.length} symbol variations for "${collectionName}": ${variations.slice(0, 5).join(", ")}...`);

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };
    if (MAGIC_EDEN_API_KEY) {
        headers["Authorization"] = `Bearer ${MAGIC_EDEN_API_KEY}`;
    }

    for (const symbol of variations) {
        try {
            const url = `${MAGIC_EDEN_API_BASE}/collections/${symbol}/stats`;
            const response = await fetch(url, { headers });

            if (response.ok) {
                const stats = await response.json();
                // Verify we got valid data
                if (stats && (stats.floorPrice !== undefined || stats.listedCount !== undefined)) {
                    console.log(`[ME] Found working symbol: ${symbol} for "${collectionName}" (floor: ${stats.floorPrice})`);
                    symbolCache.set(cacheKey, symbol);
                    return symbol;
                }
            } else {
                // Log rate limit or other errors
                if (response.status === 429) {
                    console.log(`[ME] Rate limited on symbol "${symbol}"`);
                    await new Promise(r => setTimeout(r, 500));
                }
            }

            // Small delay to avoid rate limiting
            await new Promise(r => setTimeout(r, 100));
        } catch (error) {
            console.log(`[ME] Error trying symbol "${symbol}":`, error);
        }
    }

    console.warn(`[ME] Could not find working symbol for "${collectionName}" (tried: ${variations.join(", ")})`);
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
 * Includes extensive logging for debugging trait issues
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

        let allListings: MagicEdenListing[] = [];
        const batchSize = 100; // ME max per page
        // Cap the loops to prevent taking too long. 5 pages = 500 items is a good safety limit.
        const maxPages = Math.ceil(limit / batchSize);

        for (let page = 0; page < maxPages; page++) {
            const offset = page * batchSize;
            const url = `${MAGIC_EDEN_API_BASE}/collections/${collectionSymbol}/listings?limit=${batchSize}&offset=${offset}`;
            console.log(`[ME] Fetching listings batch ${page + 1}/${maxPages} from: ${url}`);

            try {
                const response = await fetch(url, { headers });

                if (!response.ok) {
                    const errText = await response.text().catch(() => "Unknown");
                    console.warn(`[ME] API error for ${collectionSymbol} (page ${page}): ${response.status} - ${errText.substring(0, 200)}`);
                    break;
                }

                const listings = await response.json();

                if (!Array.isArray(listings) || listings.length === 0) {
                    break; // No more listings
                }

                allListings = [...allListings, ...listings];

                // If we got fewer than requested, we are at the end
                if (listings.length < batchSize) {
                    break;
                }

                // Small delay to be nice to the API
                await new Promise(r => setTimeout(r, 200));

            } catch (innerError) {
                console.error(`[ME] Error fetching batch ${page}:`, innerError);
                break;
            }
        }

        console.log(`[ME] Got ${allListings.length} total listings for ${collectionSymbol}`);

        // Log sample listing to debug trait structure
        if (allListings.length > 0) {
            const sample = allListings[0];
            const hasTopLevelAttrs = sample.attributes && sample.attributes.length > 0;
            const hasNestedAttrs = sample.token?.attributes && sample.token.attributes.length > 0;
            console.log(`[ME] Sample listing - price: ${sample.price}, topLevelAttrs: ${hasTopLevelAttrs}, nestedAttrs: ${hasNestedAttrs}`);
        }

        return allListings;
    } catch (error) {
        console.error(`[ME] Error fetching collection listings for ${collectionSymbol}:`, error);
        return [];
    }
}

/**
 * Build trait floor map from listings
 * This calculates the lowest price for each trait combination
 */
export function buildTraitFloorMap(listings: MagicEdenListing[]): TraitFloorMap {
    const traitFloors = new Map<string, number>();
    let listingsWithTraits = 0;
    let totalTraitsFound = 0;

    for (const listing of listings) {
        const price = listing.price; // Price is in SOL

        // Attributes can be at top level or nested in token object
        const attributes = listing.attributes || listing.token?.attributes || [];

        if (attributes.length > 0) {
            listingsWithTraits++;
        }

        for (const attr of attributes) {
            if (!attr.trait_type || attr.value === undefined) continue;

            totalTraitsFound++;
            const traitKey = `${attr.trait_type}: ${attr.value}`;
            const currentFloor = traitFloors.get(traitKey);

            if (currentFloor === undefined || price < currentFloor) {
                traitFloors.set(traitKey, price);
            }
        }
    }

    console.log(`[ME] Built trait floor map: ${traitFloors.size} unique traits from ${listingsWithTraits}/${listings.length} listings with attributes`);

    if (traitFloors.size > 0) {
        // Log some sample traits
        const samples = Array.from(traitFloors.entries()).slice(0, 3);
        console.log(`[ME] Sample trait floors:`, samples.map(([k, v]) => `${k}: ${v} SOL`).join(", "));
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
    collectionId?: string,
    sampleMintAddress?: string
): Promise<{
    symbol: string | null;
    floorPrice: number;
    listings: MagicEdenListing[];
    traitFloors: TraitFloorMap;
    source: "magiceden" | "tensor" | "none";
}> {
    console.log(`[ME] getCollectionData called for: "${collectionName}" (symbol: ${collectionSymbol || 'none'}, id: ${collectionId?.substring(0, 8) || 'none'}...)`);

    // First, try Magic Eden
    let workingSymbol: string | null = null;

    // METHOD 1: Use mint address to get collection symbol (MOST RELIABLE)
    if (sampleMintAddress) {
        workingSymbol = await getCollectionSymbolFromMint(sampleMintAddress);
        if (workingSymbol) {
            console.log(`[ME] Got symbol "${workingSymbol}" from mint lookup`);
        }
    }

    // METHOD 2: Try symbol variations from name (fallback)
    if (!workingSymbol) {
        workingSymbol = await findWorkingSymbol(collectionName, collectionSymbol, collectionId);
    }

    if (workingSymbol) {
        console.log(`[ME] Found working symbol: ${workingSymbol}`);

        // Fetch floor price from Magic Eden
        const floorPrice = await getCollectionFloor(workingSymbol);
        console.log(`[ME] Floor price for ${workingSymbol}: ${floorPrice} SOL`);

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

    console.log(`[ME] No working symbol found for "${collectionName}", trying Tensor fallback...`);

    // Fallback to Tensor if Magic Eden doesn't have the collection
    if (collectionId) {
        try {
            const tensorFloor = await getTensorFloorPrice(collectionId);

            if (tensorFloor > 0) {
                console.log(`[ME→Tensor] Fallback successful for "${collectionName}": ${tensorFloor.toFixed(4)} SOL`);

                // Fetch active listings from Tensor to populate trait data
                let tensorListings: any[] = [];
                let traitFloors = new Map<string, number>();

                try {
                    console.log(`[ME→Tensor] Fetching listings for trait analysis from Tensor...`);
                    tensorListings = await fetchTensorListings(collectionId);

                    // Tensor listings are compatible-ish with buildTraitFloorMap
                    // We need to cast them because TS might complain about optional fields, 
                    // but the structure { price, attributes: [...] } is present.
                    traitFloors = buildTraitFloorMap(tensorListings as any);

                    console.log(`[ME→Tensor] Built ${traitFloors.size} trait floors from ${tensorListings.length} listings`);

                } catch (e) {
                    console.error(`[ME→Tensor] Error fetching listings:`, e);
                }

                return {
                    symbol: null,
                    floorPrice: tensorFloor,
                    listings: tensorListings,
                    traitFloors: traitFloors,
                    source: "tensor",
                };
            }
        } catch (error) {
            console.error(`[Tensor] Fallback error for ${collectionName}:`, error);
        }
    }

    // Neither Magic Eden nor Tensor has this collection
    console.warn(`[ME] Could not get data for "${collectionName}" from either ME or Tensor`);
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

/**
 * Fetch token details directly from Magic Eden
 * Useful when Helius metadata fails to provide attributes
 */
export async function getTokenDetails(
    mintAddress: string
): Promise<MagicEdenListing['token'] | null> {
    try {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };
        if (MAGIC_EDEN_API_KEY) {
            headers["Authorization"] = `Bearer ${MAGIC_EDEN_API_KEY}`;
        }

        const url = `${MAGIC_EDEN_API_BASE}/tokens/${mintAddress}`;
        console.log(`[ME] Fetching token details for: ${mintAddress}`);

        const response = await fetch(url, { headers });

        if (!response.ok) {
            console.warn(`[ME] Error fetching token details: ${response.status}`);
            return null;
        }

        return await response.json();
    } catch (error) {
        console.error(`[ME] Error getting token details:`, error);
        return null;
    }
}
