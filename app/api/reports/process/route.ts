import { NextRequest, NextResponse } from "next/server";
import { supabase, NFTAuditData } from "@/app/lib/supabase";
import {
    getLastSaleForNFT,
    fetchNFTMetadataBatch
} from "@/app/lib/helius";
import {
    getCollectionData,
    analyzeNftTraits,
} from "@/app/lib/magiceden";
import {
    getCurrentSolPrice,
    getHistoricalSolPrice,
} from "@/app/lib/solprice";

/**
 * HELIUS CREDIT COSTS (approximate):
 * - getAssetBatch: 100 credits per call (up to 100 assets)
 * - Enhanced Transactions (NFT_SALE filter): 100 credits per call
 * - Enhanced Transactions (no filter): 100 credits per call
 * 
 * Per NFT cost estimate:
 * - Metadata: ~1 credit (batched efficiently)
 * - Sale history: 100-200 credits (1-2 API calls)
 * Total: ~100-200 credits per NFT
 * 
 * With 10M credits/month (Developer plan):
 * - Can process ~50,000-100,000 NFTs per month
 * - At 10 req/s Enhanced API limit, can process ~600 NFTs per minute
 * 
 * BATCH SIZE STRATEGY:
 * - Free tier (2 req/s): BATCH_SIZE = 5, process sequentially
 * - Developer tier (10 req/s): BATCH_SIZE = 15, parallel within batch
 * - Business tier (50 req/s): BATCH_SIZE = 30, aggressive parallel
 */

// Configuration based on Helius tier
const CONFIG = {
    // Set this based on your Helius plan
    HELIUS_TIER: process.env.HELIUS_TIER || "developer", // "free", "developer", "business"
    
    // Magic Eden rate limiting
    ME_DELAY_MS: parseInt(process.env.ME_DELAY_MS || "150"), // Delay between ME calls
    
    // Batch sizes per tier
    BATCH_SIZES: {
        free: 5,
        developer: 15,
        business: 30,
        professional: 50
    } as Record<string, number>,
    
    // Parallel processing within batch
    PARALLEL_SALES_LOOKUP: {
        free: 2,      // Conservative for 2 req/s
        developer: 8,  // Good for 10 req/s
        business: 25,  // Good for 50 req/s
        professional: 50
    } as Record<string, number>,
    
    // Delay between batches (ms) to avoid rate limits
    BATCH_DELAY: {
        free: 1000,
        developer: 200,
        business: 50,
        professional: 20
    } as Record<string, number>,
    
    // Max concurrent reports being processed
    MAX_CONCURRENT_REPORTS: {
        free: 1,
        developer: 3,
        business: 5,
        professional: 10
    } as Record<string, number>
};

// Get current tier config
function getTierConfig() {
    const tier = CONFIG.HELIUS_TIER;
    return {
        batchSize: CONFIG.BATCH_SIZES[tier] || 15,
        parallelSales: CONFIG.PARALLEL_SALES_LOOKUP[tier] || 8,
        batchDelay: CONFIG.BATCH_DELAY[tier] || 200,
        maxConcurrent: CONFIG.MAX_CONCURRENT_REPORTS[tier] || 3
    };
}

// Cache for collection data to avoid repeated API calls
interface CollectionCache {
    floorPrice: number;
    traitFloors: Map<string, number>;
    symbol: string | null;
}

/**
 * Process sale lookups in parallel with controlled concurrency
 * Finds the LAST ACTUAL SALE (most recent marketplace transaction) for each NFT
 */
async function processSalesInParallel(
    nfts: Array<{ id: string; name: string }>,
    maxConcurrent: number
): Promise<Map<string, { date: string; price: number; from: string; to: string; signature: string } | null>> {
    const results = new Map<string, { date: string; price: number; from: string; to: string; signature: string } | null>();
    
    // Process in chunks of maxConcurrent
    for (let i = 0; i < nfts.length; i += maxConcurrent) {
        const chunk = nfts.slice(i, i + maxConcurrent);
        
        const chunkResults = await Promise.all(
            chunk.map(async (nft) => {
                try {
                    // Get the LAST sale (most recent marketplace transaction)
                    const sale = await getLastSaleForNFT(nft.id);
                    return { id: nft.id, sale };
                } catch (error) {
                    console.error(`Error fetching sale for ${nft.name}:`, error);
                    return { id: nft.id, sale: null };
                }
            })
        );
        
        for (const result of chunkResults) {
            results.set(result.id, result.sale);
        }
        
        // Small delay between chunks to avoid rate limits
        if (i + maxConcurrent < nfts.length) {
            await new Promise(r => setTimeout(r, 50));
        }
    }
    
    return results;
}

/**
 * Check if we can process another report (concurrency limiting)
 */
async function canProcessReport(): Promise<boolean> {
    const { maxConcurrent } = getTierConfig();
    
    const { count, error } = await supabase
        .from("audit_reports")
        .select("id", { count: "exact", head: true })
        .eq("status", "processing");
    
    if (error) {
        console.error("Error checking concurrent reports:", error);
        return true; // Allow on error to not block
    }
    
    return (count || 0) < maxConcurrent;
}

/**
 * Main processing endpoint
 * 
 * Note: Netlify functions have timeout limits:
 * - Free/Pro: 10 seconds
 * - Business/Enterprise: 26 seconds
 * 
 * The batch processing is designed to complete within these limits.
 * Each batch processes quickly and returns progress, allowing the
 * frontend to call again for the next batch.
 */
export async function POST(request: NextRequest) {
    const startTime = Date.now();
    const MAX_PROCESSING_TIME = 8000; // 8 seconds max to leave buffer for response
    
    try {
        const { reportId } = await request.json();

        if (!reportId) {
            return NextResponse.json({ error: "Missing reportId" }, { status: 400 });
        }

        // 1. Fetch report state
        const { data: report, error: fetchError } = await supabase
            .from("audit_reports")
            .select("*")
            .eq("id", reportId)
            .single();

        if (fetchError || !report) {
            return NextResponse.json({ error: "Report not found" }, { status: 404 });
        }

        if (report.status === "complete") {
            return NextResponse.json({
                status: "complete",
                progress: 100,
                total: Array.isArray(report.report_json) ? report.report_json.length : 0
            });
        }

        // 2. Check concurrency limits
        const canProcess = await canProcessReport();
        if (!canProcess && report.status !== "processing") {
            return NextResponse.json({
                status: "queued",
                message: "Report queued - other reports are being processed",
                progress: 0,
                total: report.pending_mints?.length || 0
            });
        }

        let pendingMints = report.pending_mints || [];

        // SELF-HEALING: If partial but uninitialized
        if (pendingMints.length === 0 && report.status === "partial" && !Array.isArray(report.report_json)) {
            const config = report.report_json;
            const selectedMints = config.selected_mints || [];

            if (selectedMints.length > 0) {
                pendingMints = selectedMints;
                await supabase
                    .from("audit_reports")
                    .update({
                        report_json: [],
                        pending_mints: pendingMints,
                        status: "processing"
                    })
                    .eq("id", reportId);
            }
        }

        if (pendingMints.length === 0) {
            await supabase
                .from("audit_reports")
                .update({ status: "complete" })
                .eq("id", reportId);

            return NextResponse.json({
                status: "complete",
                progress: 100,
                total: Array.isArray(report.report_json) ? report.report_json.length : 0
            });
        }

        // 3. Get tier-based configuration
        const { batchSize, parallelSales, batchDelay } = getTierConfig();
        
        console.log(`[Process] Using tier "${CONFIG.HELIUS_TIER}": batchSize=${batchSize}, parallelSales=${parallelSales}`);

        // 4. Take a batch based on tier
        const batchMints = pendingMints.slice(0, batchSize);
        const remainingMints = pendingMints.slice(batchSize);

        // 5. Fetch metadata in single batch call (very efficient - 1 API call for up to 100 NFTs)
        const nftsMetadata = await fetchNFTMetadataBatch(batchMints);

        const newAuditData: NFTAuditData[] = [];
        const collectionCache = new Map<string, CollectionCache>();

        // 6. Group NFTs by collection for efficient Magic Eden lookups
        const nftsByCollection = new Map<string, typeof nftsMetadata>();
        
        for (const nft of nftsMetadata) {
            const collectionGrouping = nft.grouping?.find(g => g.group_key === "collection");
            const collectionId = collectionGrouping?.group_value || "Unknown";
            
            if (!nftsByCollection.has(collectionId)) {
                nftsByCollection.set(collectionId, []);
            }
            nftsByCollection.get(collectionId)!.push(nft);
        }

        // 7. Pre-fetch Magic Eden data for all collections (efficient batching)
        for (const [collectionId, collectionNfts] of nftsByCollection) {
            if (collectionCache.has(collectionId)) continue;
            
            const firstNft = collectionNfts[0];
            const collectionGrouping = firstNft.grouping?.find(g => g.group_key === "collection");
            
            let collectionName = collectionGrouping?.collection_metadata?.name || collectionId;
            if (collectionName === collectionId || !collectionName) {
                const nftName = firstNft.content?.metadata?.name || "";
                const match = nftName.match(/^(.*?)\s*#\d+/);
                if (match) collectionName = match[1].trim();
            }
            
            const collectionSymbol = collectionGrouping?.collection_metadata?.symbol;
            
            try {
                const meData = await getCollectionData(collectionName, collectionSymbol, collectionId);
                collectionCache.set(collectionId, {
                    floorPrice: meData.floorPrice,
                    traitFloors: meData.traitFloors,
                    symbol: meData.symbol
                });
                
                if (meData.floorPrice > 0) {
                    const source = meData.source === "tensor" ? "Tensor" : "ME";
                    console.log(`[Process] Cached ${source} data for "${collectionName}": floor=${meData.floorPrice}`);
                }
            } catch (error) {
                console.error(`[Process] ME error for ${collectionName}:`, error);
                collectionCache.set(collectionId, {
                    floorPrice: 0,
                    traitFloors: new Map(),
                    symbol: null
                });
            }
            
            // Rate limit delay between collection lookups
            await new Promise(r => setTimeout(r, CONFIG.ME_DELAY_MS));
            
            // Check if we're running low on time
            if (Date.now() - startTime > MAX_PROCESSING_TIME) {
                console.log(`[Process] Time limit approaching, will continue in next batch`);
                break;
            }
        }

        // 8. Fetch sale history in parallel (this is the expensive part)
        // Finds the LAST ACTUAL SALE (most recent marketplace transaction)
        const nftsForSaleLookup = nftsMetadata.map(nft => ({
            id: nft.id,
            name: nft.content?.metadata?.name || "Unknown"
        }));
        
        const salesResults = await processSalesInParallel(nftsForSaleLookup, parallelSales);

        // 8.5. Fetch SOL prices for USD calculations
        // Get current SOL price (for floor/trait values)
        const currentSolPrice = await getCurrentSolPrice();
        
        // Collect unique sale dates for historical price lookup
        const saleDates = new Set<string>();
        for (const [, sale] of salesResults) {
            if (sale?.date && sale.date !== "N/A") {
                // Extract just the date part (YYYY-MM-DD)
                const dateStr = sale.date.split("T")[0];
                if (dateStr && dateStr !== "N/A") {
                    saleDates.add(dateStr);
                }
            }
        }
        
        // Fetch historical prices for all unique dates
        const historicalPrices = new Map<string, number>();
        for (const dateStr of saleDates) {
            try {
                const price = await getHistoricalSolPrice(new Date(dateStr));
                historicalPrices.set(dateStr, price);
            } catch (error) {
                console.error(`[Process] Error getting historical price for ${dateStr}:`, error);
                historicalPrices.set(dateStr, currentSolPrice); // Fallback to current
            }
        }
        
        console.log(`[Process] Fetched ${historicalPrices.size} historical SOL prices, current: $${currentSolPrice.toFixed(2)}`);

        // 9. Assemble final data
        for (const nft of nftsMetadata) {
            const nftId = nft.id;
            const nftName = nft.content?.metadata?.name || "Unknown";

            const collectionGrouping = nft.grouping?.find(g => g.group_key === "collection");
            const collectionId = collectionGrouping?.group_value || "Unknown";

            let collectionName = collectionGrouping?.collection_metadata?.name || collectionId;
            if (collectionName === collectionId || !collectionName) {
                const match = nftName.match(/^(.*?)\s*#\d+/);
                if (match) collectionName = match[1].trim();
            }

            // Get cached collection data
            const cachedData = collectionCache.get(collectionId);
            const floorPrice = cachedData?.floorPrice || 0;
            let zeroCount = 0;
            let highestTraitPrice = 0;
            let highestTraitName = "None";

            // Analyze traits
            const nftAttributes = nft.content?.metadata?.attributes;
            if (nftAttributes && cachedData?.traitFloors && cachedData.traitFloors.size > 0) {
                const traitAnalysis = analyzeNftTraits(nftAttributes, cachedData.traitFloors);
                zeroCount = traitAnalysis.zeroCount;
                highestTraitPrice = traitAnalysis.highestTraitPrice;
                highestTraitName = traitAnalysis.highestTraitName;
            }

            // Get sale data from parallel results
            const lastSale = salesResults.get(nftId);
            const txDate = lastSale?.date || "N/A";
            const txPrice = lastSale?.price || 0;
            const txFrom = lastSale?.from || "N/A";
            const txTo = lastSale?.to || "N/A";
            const txId = lastSale?.signature || "N/A";

            // Calculate USD values
            let lastSaleUsd = 0;
            let solPriceAtSale = 0;
            
            if (txPrice > 0 && txDate !== "N/A") {
                const saleDateStr = txDate.split("T")[0];
                solPriceAtSale = historicalPrices.get(saleDateStr) || currentSolPrice;
                lastSaleUsd = txPrice * solPriceAtSale;
            }
            
            const floorPriceUsd = floorPrice * currentSolPrice;
            const highestTraitUsd = highestTraitPrice * currentSolPrice;
            
            // Profit vs floor (current floor USD - last sale USD)
            const profitVsFloorUsd = lastSaleUsd > 0 ? floorPriceUsd - lastSaleUsd : 0;
            
            // Profit vs trait (use highest trait if available, else floor)
            const effectiveValueUsd = highestTraitUsd > 0 ? highestTraitUsd : floorPriceUsd;
            const profitVsTraitUsd = lastSaleUsd > 0 ? effectiveValueUsd - lastSaleUsd : 0;

            newAuditData.push({
                wallet_address: report.wallet_address,
                collection_name: collectionName,
                collection_id: collectionId,
                nft_id: nftId,
                nft_name: nftName,
                floor_price_sol: floorPrice,
                zero_price_trait_count: zeroCount,
                highest_trait_price_sol: highestTraitPrice,
                highest_trait_name: highestTraitName,
                last_tx_date: txDate,
                last_tx_price_sol: txPrice,
                last_tx_from: txFrom,
                last_tx_to: txTo,
                last_tx_id: txId,
                // USD fields
                last_sale_usd: Math.round(lastSaleUsd * 100) / 100,
                floor_price_usd: Math.round(floorPriceUsd * 100) / 100,
                profit_vs_floor_usd: Math.round(profitVsFloorUsd * 100) / 100,
                highest_trait_usd: Math.round(highestTraitUsd * 100) / 100,
                profit_vs_trait_usd: Math.round(profitVsTraitUsd * 100) / 100,
                sol_price_at_sale: Math.round(solPriceAtSale * 100) / 100,
                current_sol_price: Math.round(currentSolPrice * 100) / 100,
            });
        }

        // 10. Update database
        const existingReportJson = Array.isArray(report.report_json) ? report.report_json : [];
        const updatedReportJson = [...existingReportJson, ...newAuditData];
        const isFinished = remainingMints.length === 0;

        const { error: updateError } = await supabase
            .from("audit_reports")
            .update({
                report_json: updatedReportJson,
                pending_mints: remainingMints,
                status: isFinished ? "complete" : "processing"
            })
            .eq("id", reportId);

        if (updateError) {
            throw new Error(`Failed to update report: ${updateError.message}`);
        }

        const totalMints = updatedReportJson.length + remainingMints.length;
        const progress = Math.round((updatedReportJson.length / totalMints) * 100);

        // Add delay between batches if configured
        if (!isFinished && batchDelay > 0) {
            await new Promise(r => setTimeout(r, batchDelay));
        }

        return NextResponse.json({
            status: isFinished ? "complete" : "processing",
            progress,
            processed: updatedReportJson.length,
            total: totalMints,
            batchSize,
            tier: CONFIG.HELIUS_TIER
        });

    } catch (error) {
        console.error("Batch processing error:", error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : "Unknown error"
        }, { status: 500 });
    }
}
