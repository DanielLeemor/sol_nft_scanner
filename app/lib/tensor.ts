/**
 * Tensor API Integration
 * 
 * Tensor uses collection "onchainId" (the collection address from Helius)
 * which is easier than Magic Eden's symbol system.
 * 
 * API: https://api.tensor.so
 * Docs: https://docs.tensor.so/consume/rest-api
 * 
 * No API key required for basic floor price queries!
 */

// Tensor listing data
export interface TensorListing {
    price: number; // in lamports
    mint: string;
    seller: string;
    attributes?: Array<{
        trait_type: string;
        value: string;
    }>;
}

// Tensor collection stats
export interface TensorFloorResponse {
    upper: number;      // Upper bound in lamports
    price: number;      // Smart floor price in lamports
    lower: number;      // Lower bound in lamports
    priceUnit: string;  // "SOL_LAMPORT"
    generatedFor: string;
}

// Cache for Tensor lookups
const tensorCache = new Map<string, { floorPrice: number; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get floor price from Tensor using collection's on-chain ID
 * 
 * @param collectionId - The on-chain collection address (from Helius grouping)
 * @returns Floor price in SOL, or 0 if not found
 */
export async function getTensorFloorPrice(collectionId: string): Promise<number> {
    // Check cache first
    const cached = tensorCache.get(collectionId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.floorPrice;
    }

    const url = `https://api.tensor.so/sol/collections/${collectionId}/floor`;
    console.log(`[Tensor] Fetching floor price from: ${url}`);

    try {
        const response = await fetch(url, {
            headers: {
                "Accept": "application/json",
            },
        });

        console.log(`[Tensor] Response status: ${response.status} for ${collectionId.substring(0, 8)}...`);

        if (!response.ok) {
            const errorText = await response.text();
            console.log(`[Tensor] Error response: ${errorText.substring(0, 200)}`);
            return 0;
        }

        const data: TensorFloorResponse = await response.json();
        console.log(`[Tensor] Response data:`, JSON.stringify(data).substring(0, 200));

        if (data && data.price) {
            // Convert from lamports to SOL
            const floorPrice = data.price / 1e9;

            console.log(`[Tensor] Found floor for ${collectionId.substring(0, 8)}...: ${floorPrice.toFixed(4)} SOL`);

            // Cache the result
            tensorCache.set(collectionId, {
                floorPrice,
                timestamp: Date.now()
            });

            return floorPrice;
        }

        console.log(`[Tensor] No price in response for ${collectionId.substring(0, 8)}...`);
        return 0;
    } catch (error) {
        console.error(`[Tensor] FETCH ERROR for ${collectionId}:`, error);
        return 0;
    }
}

/**
 * Get NFT price estimate from Tensor
 * This uses their ML model to estimate individual NFT prices
 * 
 * @param collectionId - The on-chain collection address
 * @param mintAddress - The specific NFT mint address
 * @returns Estimated price in SOL, or 0 if not found
 */
export async function getTensorNftPriceEstimate(
    collectionId: string,
    mintAddress: string
): Promise<number> {
    try {
        const response = await fetch(
            `https://api.tensor.so/sol/collections/${collectionId}/${mintAddress}`,
            {
                headers: {
                    "Accept": "application/json",
                },
            }
        );

        if (!response.ok) {
            return 0;
        }

        const data = await response.json();

        if (data && data.price) {
            // Convert from lamports to SOL
            return data.price / 1e9;
        }

        return 0;
    } catch (error) {
        console.error(`[Tensor] Error fetching NFT estimate:`, error);
        return 0;
    }
}

/**
 * Get list of supported collections from Tensor
 * Useful for checking if a collection is indexed
 */
export async function getTensorSupportedCollections(): Promise<Array<{ name: string; onchainId: string }>> {
    try {
        const response = await fetch(
            "https://api.tensor.so/sol/collections",
            {
                headers: {
                    "Accept": "application/json",
                },
            }
        );

        if (!response.ok) {
            return [];
        }

        return await response.json();
    } catch (error) {
        console.error("[Tensor] Error fetching collections:", error);
        return [];
    }
}

/**
 * Fetch active listings from Tensor
 * Uses the /listings endpoint
 */
export async function fetchTensorListings(
    collectionId: string,
    limit: number = 100 // Tensor API free tier often limits to 50 or 100, checking docs
): Promise<TensorListing[]> {
    // Official Docs say: "All endpoints are rate limited. You will need an API key for higher limits."
    // However, the listings endpoint limit per page is often capped.
    // If the user has a key in env, use it.
    // Using a default of 100 to be safe based on recent testing.

    // We can also try cursor pagination if we need deeper data, but for now let's just make sure the request succeeds.
    const url = `https://api.tensor.so/sol/collections/${collectionId}/listings?limit=${limit}`;
    console.log(`[Tensor] Fetching listings from: ${url}`);

    try {
        const headers: Record<string, string> = {
            "Accept": "application/json",
        };

        // Check for TENSOR_API_KEY or generic API_KEY
        const apiKey = process.env.TENSOR_API_KEY || process.env.API_KEY;
        if (apiKey) {
            headers["x-tensor-api-key"] = apiKey;
        }

        const response = await fetch(url, { headers });

        if (!response.ok) {
            console.log(`[Tensor] Error fetching listings: ${response.status}`);
            return [];
        }

        const listings = await response.json();

        if (!Array.isArray(listings)) {
            return [];
        }

        console.log(`[Tensor] Got ${listings.length} listings for ${collectionId}`);

        return listings.map((item: any) => ({
            price: (item.price || 0) / 1e9, // Convert lamports to SOL
            mint: item.mint?.onchainId || item.mint,
            seller: item.seller,
            attributes: item.mint?.attributes?.map((attr: any) => ({
                trait_type: attr.trait_type,
                value: attr.value
            })) || []
        }));

    } catch (error) {
        console.error(`[Tensor] FETCH LISTINGS ERROR for ${collectionId}:`, error);
        return [];
    }
}

/**
 * Clear the Tensor cache
 */
export function clearTensorCache(): void {
    tensorCache.clear();
}
