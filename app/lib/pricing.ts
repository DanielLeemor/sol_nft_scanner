import {
    BASE_PRICE_SOL,
    TIER_THRESHOLD,
    ADDITIONAL_TIER_PRICE,
    ADDITIONAL_TIER_SIZE,
} from "./constants";

/**
 * Calculate the price in SOL based on NFT count
 * 
 * Pricing formula:
 * - 1-20 NFTs: 0.02 SOL (base tier)
 * - 21-120 NFTs: 0.07 SOL (base + 1 tier)
 * - 121-220 NFTs: 0.12 SOL (base + 2 tiers)
 * - And so on...
 */
/**
 * Calculate the price in SOL based on NFT count
 * 
 * Formula: =INT(B1/100)*0.05 + IF(MOD(B1,100)=0, 0, IF(MOD(B1,100)<=20, 0.02, 0.05))
 */
export function calculatePrice(nftCount: number): number {
    if (nftCount <= 0) {
        return 0;
    }

    const fullHundreds = Math.floor(nftCount / 100);
    const remainder = nftCount % 100;

    let remainderPrice = 0;
    if (remainder > 0) {
        if (remainder <= 20) {
            remainderPrice = 0.02;
        } else {
            remainderPrice = 0.05;
        }
    }

    const price = (fullHundreds * 0.05) + remainderPrice;

    // Fix floating point precision
    return Math.round(price * 1000) / 1000;
}

/**
 * Convert SOL to lamports
 */
export function solToLamports(sol: number): number {
    return Math.floor(sol * 1e9);
}

/**
 * Convert lamports to SOL
 */
export function lamportsToSol(lamports: number): number {
    return lamports / 1e9;
}

/**
 * Format price for display
 */
export function formatPrice(sol: number): string {
    return `${sol.toFixed(2)} SOL`;
}

/**
 * Parse collection value string (format: "collectionId:count")
 */
export function parseCollectionValue(value: string): { id: string; count: number } {
    const [id, countStr] = value.split(":");
    return {
        id,
        count: parseInt(countStr, 10) || 0,
    };
}

/**
 * Calculate total NFT count from selected collections
 */
export function calculateTotalNfts(collections: string[]): number {
    return collections.reduce((total, collection) => {
        const { count } = parseCollectionValue(collection);
        return total + count;
    }, 0);
}
