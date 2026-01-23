import { NextRequest, NextResponse } from "next/server";
import { ACTIONS_CORS_HEADERS, APP_URL } from "@/app/lib/constants";
import { verifyPayment, recordProcessedSignature } from "@/app/lib/signature";
import { supabase, NFTAuditData } from "@/app/lib/supabase";
import {
    fetchWalletNFTs,
    groupNFTsByCollection,
    fetchNFTTransactionHistory,
    extractLastSale,
    HeliusNFT,
} from "@/app/lib/helius";
import {
    fetchCollectionListings,
    buildTraitFloorMap,
    analyzeNftTraits,
    getCollectionFloor,
} from "@/app/lib/magiceden";
import { generateCSV, createAuditSummary } from "@/app/lib/csv";
import { parseCollectionValue, calculateTotalNfts } from "@/app/lib/pricing";
import { isValidSolanaAddress, fetchWithRetry } from "@/app/lib/utils";

/**
 * POST /api/actions/reveal
 * Verify payment and return audit results
 */
export async function POST(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const wallet = searchParams.get("wallet");
        const collectionsParam = searchParams.get("collections");
        const expectedAmount = parseFloat(searchParams.get("amount") || "0");

        const body = await request.json();
        const { account, signature } = body;

        // Validate inputs
        if (!account || !isValidSolanaAddress(account)) {
            return NextResponse.json(
                { error: "Invalid account address" },
                { headers: ACTIONS_CORS_HEADERS, status: 400 }
            );
        }

        if (!signature) {
            return NextResponse.json(
                { error: "Missing transaction signature" },
                { headers: ACTIONS_CORS_HEADERS, status: 400 }
            );
        }

        let selectedCollections: string[] = [];
        let selectedMints: string[] = [];
        const reportId = searchParams.get("reportId");

        // Try to load selection from Supabase report first (new granular mode)
        if (reportId) {
            const { data: pendingReport } = await supabase
                .from("audit_reports")
                .select("report_json")
                .eq("id", reportId)
                .single();

            if (pendingReport?.report_json) {
                const stored = pendingReport.report_json as any;
                selectedMints = stored.selected_mints || [];
                selectedCollections = stored.selected_collections || [];
            }
        }

        // Fallback to URL params (legacy blink mode)
        if (selectedMints.length === 0 && selectedCollections.length === 0) {
            try {
                selectedCollections = JSON.parse(decodeURIComponent(collectionsParam || "[]"));
            } catch {
                return NextResponse.json(
                    { error: "Invalid collections parameter" },
                    { headers: ACTIONS_CORS_HEADERS, status: 400 }
                );
            }
        }

        // Verify payment
        const verification = await verifyPayment(signature, expectedAmount);

        if (!verification.verified) {
            return NextResponse.json(
                {
                    type: "action",
                    icon: `${APP_URL}/error.png`,
                    title: "Payment Verification Failed",
                    description: verification.error || "Could not verify payment",
                    label: "Error",
                    disabled: true,
                },
                { headers: ACTIONS_CORS_HEADERS, status: 401 }
            );
        }

        // Fetch NFTs and generate audit report
        const targetWallet = wallet || account;
        const nfts = await fetchWalletNFTs(targetWallet);
        const collections = groupNFTsByCollection(nfts);

        // Filter NFTs based on selection mode
        const selectedNfts: HeliusNFT[] = [];

        if (selectedMints.length > 0) {
            // Granular mode: filter by specific mint IDs
            const mintSet = new Set(selectedMints);
            for (const collection of collections.values()) {
                for (const nft of collection.nfts) {
                    if (mintSet.has(nft.id)) {
                        selectedNfts.push(nft);
                    }
                }
            }
        } else {
            // Legacy mode: filter by collection IDs
            const selectedCollectionIds = new Set(
                selectedCollections.map((c) => parseCollectionValue(c).id)
            );
            for (const [collectionId, collection] of collections) {
                if (selectedCollectionIds.has(collectionId)) {
                    selectedNfts.push(...collection.nfts);
                }
            }
        }

        // Process each NFT
        const auditData: NFTAuditData[] = [];
        const traitFloorCache = new Map<string, Map<string, number>>();
        const floorPriceCache = new Map<string, number>();

        for (const nft of selectedNfts) {
            try {
                const collectionGrouping = nft.grouping?.find(
                    (g) => g.group_key === "collection"
                );
                const collectionId = collectionGrouping?.group_value || "Unknown";
                const collectionName =
                    collectionGrouping?.collection_metadata?.name || collectionId;
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

                // Fetch transaction history
                const txHistory = await fetchNFTTransactionHistory(nft.id);
                const lastSale = extractLastSale(txHistory);

                auditData.push({
                    wallet_address: targetWallet,
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
                });
            } catch (nftError) {
                console.error(`Error processing NFT ${nft.id}:`, nftError);
                // Continue with other NFTs
            }
        }

        // Store report in Supabase
        const { data: report, error: reportError } = await supabase
            .from("audit_reports")
            .insert({
                wallet_address: targetWallet,
                report_json: auditData,
                status: auditData.length === selectedNfts.length ? "complete" : "partial",
            })
            .select("id")
            .single();

        if (reportError) {
            console.error("Error saving report:", reportError);
        }

        const finalReportId = reportId || report?.id;

        // Record the processed signature
        await recordProcessedSignature(
            signature,
            targetWallet,
            expectedAmount,
            selectedMints.length || calculateTotalNfts(selectedCollections),
            selectedCollections,
            finalReportId || undefined
        );

        // Generate summary
        const summary = createAuditSummary(auditData);

        return NextResponse.json(
            {
                type: "completed",
                title: "Audit Complete!",
                description: `Analyzed ${summary.totalNfts} NFTs across ${summary.totalCollections} collections. Found ${summary.nftsWithHighValueTraits} NFTs with traits above floor price.`,
                icon: `${APP_URL}/success.png`,
                links: {
                    actions: [
                        {
                            type: "external-link",
                            label: "Download CSV Report",
                            href: `${APP_URL}/api/download?id=${finalReportId}`,
                        },
                    ],
                },
            },
            { headers: ACTIONS_CORS_HEADERS }
        );
    } catch (error) {
        console.error("POST /api/actions/reveal error:", error);
        return NextResponse.json(
            {
                type: "action",
                icon: `${APP_URL}/error.png`,
                title: "Error",
                description: "An error occurred while generating your report. Please contact support.",
                label: "Error",
                disabled: true,
                error: {
                    message: error instanceof Error ? error.message : "Unknown error",
                },
            },
            { headers: ACTIONS_CORS_HEADERS, status: 500 }
        );
    }
}

export async function OPTIONS() {
    return new Response(null, {
        headers: ACTIONS_CORS_HEADERS,
    });
}
