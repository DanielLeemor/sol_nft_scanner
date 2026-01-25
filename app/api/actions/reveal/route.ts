import { NextRequest, NextResponse } from "next/server";
import { ACTIONS_CORS_HEADERS, APP_URL } from "@/app/lib/constants";
import { verifyPayment, recordProcessedSignature } from "@/app/lib/signature";
import { supabase, AuditReport } from "@/app/lib/supabase";
import {
    fetchWalletNFTs,
    groupNFTsByCollection,
    HeliusNFT,
} from "@/app/lib/helius";
import { parseCollectionValue } from "@/app/lib/pricing";
import { isValidSolanaAddress } from "@/app/lib/utils";
import { recordWalletScan } from "@/app/lib/rate-limit";

/**
 * POST /api/actions/reveal
 * Verify payment and return audit results
 */
export async function POST(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const wallet = searchParams.get("wallet");
        const collectionsParam = searchParams.get("collections");
        const amountParam = searchParams.get("amount");
        const reportIdParam = searchParams.get("reportId");
        const expectedAmount = parseFloat(amountParam || "0");

        const body = await request.json().catch(() => ({}));
        const { account, signature, targetWallet: bodyTargetWallet, reportId: bodyReportId, data } = body;

        // Initialize selection variables
        let selectedMints: string[] = [];
        let selectedCollections: string[] = [];
        let targetWallet = bodyTargetWallet || wallet || account;
        let finalReportId = bodyReportId || reportIdParam;

        // 1. Try to load from existing report
        if (finalReportId) {
            const { data: reportData } = await supabase
                .from("audit_reports")
                .select("*")
                .eq("id", finalReportId)
                .single();

            if (reportData) {
                const rJson = reportData.report_json;
                if (!Array.isArray(rJson)) {
                    selectedMints = rJson.selected_mints || [];
                    selectedCollections = rJson.selected_collections || [];
                }
                targetWallet = reportData.wallet_address || targetWallet;
            }
        }
        // 2. Fallback to direct data payload
        else if (data) {
            if (data.mints) selectedMints = data.mints;
            if (data.collections) selectedCollections = Array.isArray(data.collections) ? data.collections : [data.collections];
        }
        // 3. Fallback to URL params
        else if (collectionsParam) {
            selectedCollections = collectionsParam.split(",");
        }

        // Validate inputs
        if (!account || !isValidSolanaAddress(account)) {
            return NextResponse.json(
                { error: "Invalid account address" },
                { headers: ACTIONS_CORS_HEADERS, status: 400 }
            );
        }

        // Verify payment
        let verification: { verified: boolean; error?: string; payer?: string } = { verified: false, error: "Payment required" };
        const { getPendingPaymentData } = await import("@/app/lib/signature");

        if (!signature) {
            return NextResponse.json(
                { error: "Missing transaction signature" },
                { headers: ACTIONS_CORS_HEADERS, status: 400 }
            );
        }

        // ---------------------------------------------------------
        // 1. Handle Admin Bypass
        // ---------------------------------------------------------
        if (signature === "ADMIN_BYPASS") {
            const { TREASURY_WALLET } = await import("@/app/lib/constants");
            if (account === TREASURY_WALLET) {
                console.log(`[Admin Bypass] Authorized for ${account}`);
                verification = { verified: true, error: "" };
            } else {
                return NextResponse.json(
                    { error: "Unauthorized bypass attempt" },
                    { headers: ACTIONS_CORS_HEADERS, status: 403 }
                );
            }
        }
        // ---------------------------------------------------------
        // 2. Handle Existing Processed Signature
        // ---------------------------------------------------------
        else {
            const existingData = await getPendingPaymentData(signature);
            if (existingData && existingData.report_id) {
                console.log(`[Reveal] Signature already processed, returning existing report: ${existingData.report_id}`);
                return NextResponse.json(
                    {
                        type: "completed",
                        title: "Report Ready!",
                        description: `Your report for this audit is ready.`,
                        icon: `${APP_URL}/success.png`,
                        reportId: existingData.report_id,
                        links: {
                            actions: [
                                {
                                    type: "external-link",
                                    label: "View Report Progress",
                                    href: `${APP_URL}/reports?id=${existingData.report_id}`,
                                },
                            ],
                        },
                    },
                    { headers: ACTIONS_CORS_HEADERS }
                );
            }

            // 3. Regular Verification
            verification = await verifyPayment(signature, expectedAmount);
        }

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

        // Initialize the report as 'processing'
        // We do NOT process the NFTs here to avoid timeouts.
        const mintList = selectedNfts.map((n: HeliusNFT) => n.id);

        // UPSERT the report in Supabase
        // If finalReportId exists, it updates the "partial" report from the audit step.
        // Otherwise it creates a new one.
        const reportObj: Partial<AuditReport> & { id?: string } = {
            wallet_address: targetWallet,
            report_json: [], // Start/reset empty
            status: "processing",
            pending_mints: mintList,
            nft_count: mintList.length,
            created_at: new Date().toISOString() // Refresh timestamp
        };

        if (finalReportId) {
            reportObj.id = finalReportId;
        }

        const { data: report, error: reportError } = await supabase
            .from("audit_reports")
            .upsert(reportObj)
            .select("id")
            .single();

        if (reportError) {
            console.error("Error saving report:", reportError);
            throw new Error(`Failed to initialize report: ${reportError.message}`);
        }

        if (report?.id) {
            finalReportId = report.id;
        }

        // Record the processed signature
        await recordProcessedSignature(
            signature,
            targetWallet,
            expectedAmount,
            mintList.length,
            selectedCollections,
            finalReportId || undefined
        );

        // Record the scan to enforce rate limits on future attempts
        await recordWalletScan(targetWallet);

        return NextResponse.json(
            {
                type: "completed",
                title: "Payment Verified!",
                description: `Successfully verified payment for ${mintList.length} NFTs. Your report is being generated in the background.`,
                icon: `${APP_URL}/success.png`,
                reportId: finalReportId,
                links: {
                    actions: [
                        {
                            type: "external-link",
                            label: "View Report Progress",
                            href: `${APP_URL}/reports?id=${finalReportId}`,
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
