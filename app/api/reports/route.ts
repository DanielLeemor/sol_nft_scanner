import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { isValidSolanaAddress } from "@/app/lib/utils";

/**
 * GET /api/reports?wallet=WALLET_ADDRESS
 * Fetch all reports for a wallet
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const wallet = searchParams.get("wallet");

        if (!wallet || !isValidSolanaAddress(wallet)) {
            return NextResponse.json(
                { error: "Invalid wallet address" },
                { status: 400 }
            );
        }

        // Fetch reports from Supabase
        const { data: reports, error } = await supabase
            .from("audit_reports")
            .select("id, wallet_address, status, created_at, report_json")
            .eq("wallet_address", wallet)
            .order("created_at", { ascending: false })
            .limit(50);

        if (error) {
            console.error("Error fetching reports:", error);
            return NextResponse.json(
                { error: "Failed to fetch reports" },
                { status: 500 }
            );
        }

        // Process reports to add computed fields
        const now = new Date();
        const processedReports = (reports || []).map((report) => {
            const createdAt = new Date(report.created_at);
            const hoursOld = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

            // Count NFTs from report_json
            let nftCount = 0;
            if (Array.isArray(report.report_json)) {
                nftCount = report.report_json.length;
            } else if (report.report_json?.selected_mints) {
                // Pending report - count selected mints
                nftCount = report.report_json.selected_mints.length;
            }

            return {
                id: report.id,
                wallet_address: report.wallet_address,
                status: report.status,
                created_at: report.created_at,
                nft_count: nftCount,
                is_expired: hoursOld > 24
            };
        });

        // Filter out pending reports that are empty
        const validReports = processedReports.filter(
            (r) => r.status !== "pending" || r.nft_count > 0
        );

        return NextResponse.json({
            reports: validReports
        });
    } catch (error) {
        console.error("Reports API error:", error);
        return NextResponse.json(
            { error: "Failed to fetch reports" },
            { status: 500 }
        );
    }
}
