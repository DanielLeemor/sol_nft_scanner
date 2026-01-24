import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { isValidSolanaAddress } from "@/app/lib/utils";
import { TREASURY_WALLET } from "@/app/lib/constants";

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
        let query = supabase
            .from("audit_reports")
            .select("id, wallet_address, status, created_at, report_json, pending_mints")
            .order("created_at", { ascending: false })
            .limit(50);

        // Standard user: see only their own reports
        // Admin: see everything (so client-side processing can resume for target wallets)
        if (wallet !== TREASURY_WALLET) {
            query = query.eq("wallet_address", wallet);
        }

        const { data: reports, error } = await query;

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

            // Calculate total NFTs (processed + pending)
            const processedCount = Array.isArray(report.report_json) ? report.report_json.length : 0;
            const pendingCount = Array.isArray(report.pending_mints) ? report.pending_mints.length : 0;
            const totalCount = processedCount + pendingCount;

            return {
                id: report.id,
                wallet_address: report.wallet_address,
                status: report.status,
                created_at: report.created_at,
                nft_count: totalCount,
                pending_mints: report.pending_mints || [],
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

/**
 * DELETE /api/reports?id=REPORT_ID
 * Delete a specific report
 */
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json({ error: "Missing report ID" }, { status: 400 });
        }

        const { error } = await supabase
            .from("audit_reports")
            .delete()
            .eq("id", id);

        if (error) {
            console.error("Error deleting report:", error);
            return NextResponse.json({ error: "Failed to delete report" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Delete report error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
