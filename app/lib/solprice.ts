/**
 * SOL Price Service
 * 
 * Uses CoinGecko API for current and historical SOL/USD prices.
 * Falls back to a simple estimation if API fails.
 */

// Cache for historical prices (date string YYYY-MM-DD -> price)
const historicalPriceCache = new Map<string, number>();

// Cache for current price (with TTL)
let currentPriceCache: { price: number; timestamp: number } | null = null;
const CURRENT_PRICE_TTL = 60 * 1000; // 1 minute

// CoinGecko rate limiting - be very conservative
let lastCoinGeckoCall = 0;
const COINGECKO_DELAY = 6500; // ~6.5 seconds between calls (very safe for free tier)

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
                headers: { "Accept": "application/json" },
            }
        );
        
        if (!response.ok) {
            console.error(`[CoinGecko] Error fetching current price: ${response.status}`);
            // Return cached or fallback
            return currentPriceCache?.price || 150; // Reasonable fallback
        }
        
        const data = await response.json();
        const price = data?.solana?.usd || 0;
        
        if (price > 0) {
            currentPriceCache = { price, timestamp: Date.now() };
            console.log(`[CoinGecko] Current SOL price: $${price.toFixed(2)}`);
        }
        
        return price || currentPriceCache?.price || 150;
    } catch (error) {
        console.error("[CoinGecko] Error fetching current price:", error);
        return currentPriceCache?.price || 150;
    }
}

/**
 * Get historical SOL price for a specific date
 * Uses market_chart/range API for better reliability
 */
export async function getHistoricalSolPrice(date: Date | string): Promise<number> {
    const dateObj = typeof date === "string" ? new Date(date) : date;
    
    // Create cache key as YYYY-MM-DD
    const year = dateObj.getUTCFullYear();
    const month = (dateObj.getUTCMonth() + 1).toString().padStart(2, "0");
    const day = dateObj.getUTCDate().toString().padStart(2, "0");
    const dateKey = `${year}-${month}-${day}`;
    
    // Check cache first
    if (historicalPriceCache.has(dateKey)) {
        const cached = historicalPriceCache.get(dateKey)!;
        console.log(`[CoinGecko] Cache hit for ${dateKey}: $${cached.toFixed(2)}`);
        return cached;
    }
    
    // If date is today or future, use current price
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const targetDate = new Date(dateObj);
    targetDate.setUTCHours(0, 0, 0, 0);
    
    if (targetDate >= today) {
        return getCurrentSolPrice();
    }
    
    try {
        await waitForRateLimit();
        
        // Use market_chart/range API - get prices for a range around the target date
        // This is more reliable than the /history endpoint
        const fromTimestamp = Math.floor(targetDate.getTime() / 1000);
        const toTimestamp = fromTimestamp + 86400; // +1 day
        
        const response = await fetch(
            `https://api.coingecko.com/api/v3/coins/solana/market_chart/range?vs_currency=usd&from=${fromTimestamp}&to=${toTimestamp}`,
            {
                headers: { "Accept": "application/json" },
            }
        );
        
        if (!response.ok) {
            console.error(`[CoinGecko] Error fetching historical price for ${dateKey}: ${response.status}`);
            // Try the history endpoint as fallback
            return await getHistoricalSolPriceFallback(dateObj, dateKey);
        }
        
        const data = await response.json();
        const prices = data?.prices;
        
        if (prices && prices.length > 0) {
            // Get the price closest to the target date
            const price = prices[0][1]; // [timestamp, price]
            
            if (price > 0) {
                historicalPriceCache.set(dateKey, price);
                console.log(`[CoinGecko] SOL price on ${dateKey}: $${price.toFixed(2)}`);
                return price;
            }
        }
        
        // Fallback to history endpoint
        return await getHistoricalSolPriceFallback(dateObj, dateKey);
    } catch (error) {
        console.error(`[CoinGecko] Error fetching historical price for ${dateKey}:`, error);
        return await getHistoricalSolPriceFallback(dateObj, dateKey);
    }
}

/**
 * Fallback using the /history endpoint (DD-MM-YYYY format)
 */
async function getHistoricalSolPriceFallback(dateObj: Date, dateKey: string): Promise<number> {
    try {
        await waitForRateLimit();
        
        const day = dateObj.getUTCDate().toString().padStart(2, "0");
        const month = (dateObj.getUTCMonth() + 1).toString().padStart(2, "0");
        const year = dateObj.getUTCFullYear();
        const cgDateKey = `${day}-${month}-${year}`;
        
        const response = await fetch(
            `https://api.coingecko.com/api/v3/coins/solana/history?date=${cgDateKey}&localization=false`,
            {
                headers: { "Accept": "application/json" },
            }
        );
        
        if (!response.ok) {
            console.warn(`[CoinGecko] Fallback also failed for ${dateKey}: ${response.status}`);
            // Use estimation based on date
            return estimateHistoricalPrice(dateObj);
        }
        
        const data = await response.json();
        const price = data?.market_data?.current_price?.usd || 0;
        
        if (price > 0) {
            historicalPriceCache.set(dateKey, price);
            console.log(`[CoinGecko] SOL price on ${dateKey} (fallback): $${price.toFixed(2)}`);
            return price;
        }
        
        return estimateHistoricalPrice(dateObj);
    } catch (error) {
        console.error(`[CoinGecko] Fallback error for ${dateKey}:`, error);
        return estimateHistoricalPrice(dateObj);
    }
}

/**
 * Estimate historical price when API fails
 * Uses rough approximations based on SOL's historical price ranges
 */
function estimateHistoricalPrice(date: Date): number {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    
    // Very rough estimates based on SOL historical averages
    // These are approximations - better than returning today's price
    if (year <= 2021) {
        return 50; // 2021 average roughly
    } else if (year === 2022) {
        if (month <= 4) return 100;
        if (month <= 8) return 40;
        return 25; // FTX crash period
    } else if (year === 2023) {
        if (month <= 6) return 22;
        return 30;
    } else if (year === 2024) {
        if (month <= 3) return 100;
        if (month <= 6) return 140;
        if (month <= 9) return 140;
        return 180;
    } else {
        // 2025+
        return 200;
    }
}

/**
 * Get historical prices for multiple dates efficiently
 */
export async function getHistoricalPricesBatch(
    dates: (Date | string)[]
): Promise<Map<string, number>> {
    const results = new Map<string, number>();
    
    // Deduplicate dates
    const uniqueDates = new Map<string, Date>();
    for (const date of dates) {
        const dateObj = typeof date === "string" ? new Date(date) : date;
        const key = dateObj.toISOString().split("T")[0];
        if (!uniqueDates.has(key)) {
            uniqueDates.set(key, dateObj);
        }
    }
    
    console.log(`[CoinGecko] Fetching ${uniqueDates.size} unique historical prices...`);
    
    for (const [key, dateObj] of uniqueDates) {
        const price = await getHistoricalSolPrice(dateObj);
        results.set(key, price);
    }
    
    return results;
}

/**
 * Convert SOL amount to USD using current price
 */
export async function solToUsd(solAmount: number): Promise<number> {
    const price = await getCurrentSolPrice();
    return solAmount * price;
}

/**
 * Convert SOL amount to USD using historical price
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
