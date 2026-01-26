/**
 * SOL Price Service
 * 
 * Uses CoinGecko API (free tier: 30 calls/min, 10k calls/month)
 * to get current and historical SOL/USD prices.
 * 
 * Caches prices to minimize API calls.
 */

// Cache for historical prices (date string -> price)
const historicalPriceCache = new Map<string, number>();

// Cache for current price (with TTL)
let currentPriceCache: { price: number; timestamp: number } | null = null;
const CURRENT_PRICE_TTL = 60 * 1000; // 1 minute

// CoinGecko rate limiting
let lastCoinGeckoCall = 0;
const COINGECKO_DELAY = 2100; // ~2.1 seconds between calls (safe for 30/min limit)

/**
 * Wait for rate limit if needed
 */
async function waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastCall = now - lastCoinGeckoCall;
    
    if (timeSinceLastCall < COINGECKO_DELAY) {
        await new Promise(resolve => setTimeout(resolve, COINGECKO_DELAY - timeSinceLastCall));
    }
    
    lastCoinGeckoCall = Date.now();
}

/**
 * Get current SOL price in USD
 * 
 * @returns Current SOL price in USD
 */
export async function getCurrentSolPrice(): Promise<number> {
    // Check cache first
    if (currentPriceCache && Date.now() - currentPriceCache.timestamp < CURRENT_PRICE_TTL) {
        return currentPriceCache.price;
    }
    
    try {
        await waitForRateLimit();
        
        const response = await fetch(
            "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
            {
                headers: {
                    "Accept": "application/json",
                },
            }
        );
        
        if (!response.ok) {
            console.error(`[CoinGecko] Error fetching current price: ${response.status}`);
            return currentPriceCache?.price || 0;
        }
        
        const data = await response.json();
        const price = data?.solana?.usd || 0;
        
        // Update cache
        currentPriceCache = {
            price,
            timestamp: Date.now(),
        };
        
        console.log(`[CoinGecko] Current SOL price: $${price.toFixed(2)}`);
        return price;
    } catch (error) {
        console.error("[CoinGecko] Error fetching current price:", error);
        return currentPriceCache?.price || 0;
    }
}

/**
 * Get historical SOL price for a specific date
 * 
 * @param date - Date object or ISO string
 * @returns SOL price in USD on that date
 */
export async function getHistoricalSolPrice(date: Date | string): Promise<number> {
    // Convert to Date if string
    const dateObj = typeof date === "string" ? new Date(date) : date;
    
    // Format date as DD-MM-YYYY for CoinGecko API
    const day = dateObj.getUTCDate().toString().padStart(2, "0");
    const month = (dateObj.getUTCMonth() + 1).toString().padStart(2, "0");
    const year = dateObj.getUTCFullYear();
    const dateKey = `${day}-${month}-${year}`;
    
    // Check cache first
    if (historicalPriceCache.has(dateKey)) {
        return historicalPriceCache.get(dateKey)!;
    }
    
    // If date is today, use current price endpoint (more accurate)
    const today = new Date();
    if (
        dateObj.getUTCDate() === today.getUTCDate() &&
        dateObj.getUTCMonth() === today.getUTCMonth() &&
        dateObj.getUTCFullYear() === today.getUTCFullYear()
    ) {
        return getCurrentSolPrice();
    }
    
    try {
        await waitForRateLimit();
        
        const response = await fetch(
            `https://api.coingecko.com/api/v3/coins/solana/history?date=${dateKey}&localization=false`,
            {
                headers: {
                    "Accept": "application/json",
                },
            }
        );
        
        if (!response.ok) {
            console.error(`[CoinGecko] Error fetching historical price for ${dateKey}: ${response.status}`);
            // Return current price as fallback
            return getCurrentSolPrice();
        }
        
        const data = await response.json();
        const price = data?.market_data?.current_price?.usd || 0;
        
        if (price > 0) {
            // Cache the result (historical prices don't change)
            historicalPriceCache.set(dateKey, price);
            console.log(`[CoinGecko] SOL price on ${dateKey}: $${price.toFixed(2)}`);
        }
        
        return price;
    } catch (error) {
        console.error(`[CoinGecko] Error fetching historical price for ${dateKey}:`, error);
        // Return current price as fallback
        return getCurrentSolPrice();
    }
}

/**
 * Get historical prices for multiple dates efficiently
 * Groups requests and respects rate limits
 * 
 * @param dates - Array of dates to fetch prices for
 * @returns Map of date string (YYYY-MM-DD) to price
 */
export async function getHistoricalPricesBatch(
    dates: (Date | string)[]
): Promise<Map<string, number>> {
    const results = new Map<string, number>();
    
    // Deduplicate dates and convert to consistent format
    const uniqueDates = new Map<string, Date>();
    for (const date of dates) {
        const dateObj = typeof date === "string" ? new Date(date) : date;
        const key = dateObj.toISOString().split("T")[0]; // YYYY-MM-DD
        if (!uniqueDates.has(key)) {
            uniqueDates.set(key, dateObj);
        }
    }
    
    console.log(`[CoinGecko] Fetching ${uniqueDates.size} unique historical prices...`);
    
    // Fetch prices for each unique date
    for (const [key, dateObj] of uniqueDates) {
        const price = await getHistoricalSolPrice(dateObj);
        results.set(key, price);
    }
    
    return results;
}

/**
 * Convert SOL amount to USD using current price
 * 
 * @param solAmount - Amount in SOL
 * @returns Amount in USD
 */
export async function solToUsd(solAmount: number): Promise<number> {
    const price = await getCurrentSolPrice();
    return solAmount * price;
}

/**
 * Convert SOL amount to USD using historical price
 * 
 * @param solAmount - Amount in SOL
 * @param date - Date of the transaction
 * @returns Amount in USD at that date
 */
export async function solToUsdHistorical(
    solAmount: number,
    date: Date | string
): Promise<number> {
    const price = await getHistoricalSolPrice(date);
    return solAmount * price;
}

/**
 * Calculate profit/loss in USD
 * 
 * @param currentValueSol - Current value in SOL (floor price or trait price)
 * @param purchasePriceSol - Purchase price in SOL
 * @param purchaseDate - Date of purchase
 * @returns Object with USD values and profit/loss
 */
export async function calculateProfitLossUsd(
    currentValueSol: number,
    purchasePriceSol: number,
    purchaseDate: Date | string
): Promise<{
    currentValueUsd: number;
    purchasePriceUsd: number;
    profitLossUsd: number;
    profitLossPercent: number;
}> {
    const [currentSolPrice, historicalSolPrice] = await Promise.all([
        getCurrentSolPrice(),
        getHistoricalSolPrice(purchaseDate),
    ]);
    
    const currentValueUsd = currentValueSol * currentSolPrice;
    const purchasePriceUsd = purchasePriceSol * historicalSolPrice;
    const profitLossUsd = currentValueUsd - purchasePriceUsd;
    const profitLossPercent = purchasePriceUsd > 0 
        ? ((profitLossUsd / purchasePriceUsd) * 100) 
        : 0;
    
    return {
        currentValueUsd,
        purchasePriceUsd,
        profitLossUsd,
        profitLossPercent,
    };
}

/**
 * Clear all caches
 */
export function clearPriceCache(): void {
    historicalPriceCache.clear();
    currentPriceCache = null;
}

/**
 * Get cache stats for debugging
 */
export function getCacheStats(): {
    historicalCacheSize: number;
    currentPriceCached: boolean;
    currentPrice: number | null;
} {
    return {
        historicalCacheSize: historicalPriceCache.size,
        currentPriceCached: currentPriceCache !== null,
        currentPrice: currentPriceCache?.price || null,
    };
}
