import { NextRequest, NextResponse } from "next/server";
import { supabase, NFTAuditData } from "@/app/lib/supabase";
import {
    fetchNFTTransactionHistory,
    extractLastSale,
    fetchNFTMetadataBatch
} from "@/app/lib/helius";
import {
    fetchCollectionListings,
    buildTraitFloorMap,
    analyzeNftTraits,
    getCollectionFloor,
} from "@/app/lib/magiceden";
import { fetchWithRetry } from "@/app/lib/utils";

const BATCH_SIZE = 5;

export async function POST(request: NextRequest) {
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
                total: report.report_json.length
            });
        }

        const pendingMints = report.pending_mints || [];
        if (pendingMints.length === 0) {
            // Should have been marked complete
            await supabase
                .from("audit_reports")
                .update({ status: "complete" })
                .eq("id", reportId);

            return NextResponse.json({
                status: "complete",
                progress: 100,
                total: report.report_json.length
            });
        }

        // 2. Take a small batch
        const batchMints = pendingMints.slice(0, BATCH_SIZE);
        const remainingMints = pendingMints.slice(BATCH_SIZE);

        // 3. Process batch
        // We use the Helius metadata batch API to get basic info efficiently
        const nftsMetadata = await fetchNFTMetadataBatch(batchMints);

        const newAuditData: NFTAuditData[] = [];
        const traitFloorCache = new Map<string, Map<string, number>>();
        const floorPriceCache = new Map<string, number>();

        for (const nft of nftsMetadata) {
            try {
                const collectionGrouping = nft.grouping?.find(
                    (g) => g.group_key === "collection"
                );
                const collectionId = collectionGrouping?.group_value || "Unknown";

                // Smart fallback for collection name
                let collectionName = collectionGrouping?.collection_metadata?.name || collectionId;
                if (collectionName === collectionId || !collectionName) {
                    const nftName = nft.content?.metadata?.name || "";
                    const match = nftName.match(/^(.*?)\s*#\d+/);
                    if (match) {
                        collectionName = match[1].trim();
                    }
                }

                const collectionSymbol =
                    collectionGrouping?.collection_metadata?.symbol ||
                    collectionName.toLowerCase().replace(/\s+/g, "_");

                // Get or fetch trait floors for this collection
                let traitFloors = traitFloorCache.get(collectionSymbol);
                if (!traitFloors) {
                    const listings = await fetchWithRetry(() =>
                        fetchCollectionListings(collectionSymbol)
                    );
                    traitFloors = buildTraitFloorMap(listings);
                    traitFloorCache.set(collectionSymbol, traitFloors);
                }

                // Get or fetch floor price
                let floorPrice = floorPriceCache.get(collectionSymbol);
                if (floorPrice === undefined) {
                    floorPrice = await fetchWithRetry(() =>
                        getCollectionFloor(collectionSymbol)
                    );
                    floorPriceCache.set(collectionSymbol, floorPrice);
                }

                // Analyze traits
                const nftAttributes = nft.content?.metadata?.attributes;
                const traitAnalysis = analyzeNftTraits(nftAttributes, traitFloors);

                // Fetch transaction history (Rate limited call)
                const txHistory = await fetchNFTTransactionHistory(nft.id);
                const lastSale = extractLastSale(txHistory);

                newAuditData.push({
                    wallet_address: report.wallet_address,
                    collection_name: collectionName,
                    collection_id: collectionId,
                    nft_id: nft.id,
                    nft_name: nft.content?.metadata?.name || "Unknown",
                    floor_price_sol: floorPrice,
                    zero_price_trait_count: traitAnalysis.zeroCount,
                    highest_trait_price_sol: traitAnalysis.highestTraitPrice,
                    highest_trait_name: traitAnalysis.highestTraitName,
                    last_tx_date: lastSale?.date || "N/A",
                    last_tx_price_sol: lastSale?.price || 0,
                    last_tx_from: lastSale?.from || "N/A",
                    last_tx_to: lastSale?.to || "N/A",
                    last_tx_id: lastSale?.signature || "N/A",
                });
            } catch (nftError) {
                console.error(`Error processing NFT ${nft.id} in batch:`, nftError);
                // We add it with empty data so the UI doesn't hang
                newAuditData.push({
                    wallet_address: report.wallet_address,
                    collection_name: "Error",
                    collection_id: "Error",
                    nft_id: nft.id,
                    nft_name: "Failed to Load",
                    floor_price_sol: 0,
                    zero_price_trait_count: 0,
                    highest_trait_price_sol: 0,
                    highest_trait_name: "Error",
                    last_tx_date: "ERROR",
                    last_tx_price_sol: 0,
                    last_tx_from: "N/A",
                    last_tx_to: "N/A",
                    last_tx_id: "N/A",
                });
            }
        }

        // 4. Update Supabase
        const updatedReportJson = [...(report.report_json || []), ...newAuditData];
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

        return NextResponse.json({
            status: isFinished ? "complete" : "processing",
            progress,
            processed: updatedReportJson.length,
            total: totalMints
        });

    } catch (error) {
        console.error("Batch processing error:", error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : "Unknown error"
        }, { status: 500 });
    }
}
