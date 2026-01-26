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
    
    try {
        const response = await fetch(
            `https://api.tensor.so/sol/collections/${collectionId}/floor`,
            {
                headers: {
                    "Accept": "application/json",
                },
            }
        );
        
        if (!response.ok) {
            console.log(`[Tensor] No data for collection ${collectionId.substring(0, 8)}...`);
            return 0;
        }
        
        const data: TensorFloorResponse = await response.json();
        
        if (data && data.price) {
            // Convert from lamports to SOL
            const floorPrice = data.price / 1e9;
            
            console.log(`[Tensor] Found floor for ${collectionId.substring(0, 8)}...: ${floorPrice.toFixed(2)} SOL`);
            
            // Cache the result
            tensorCache.set(collectionId, {
                floorPrice,
                timestamp: Date.now()
            });
            
            return floorPrice;
        }
        
        return 0;
    } catch (error) {
        console.error(`[Tensor] Error fetching floor for ${collectionId}:`, error);
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
 * Clear the Tensor cache
 */
export function clearTensorCache(): void {
    tensorCache.clear();
}
