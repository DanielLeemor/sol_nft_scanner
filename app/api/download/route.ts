import { NextRequest, NextResponse } from "next/server";
import { supabase, AuditReport } from "@/app/lib/supabase";
import { generateCSV } from "@/app/lib/csv";

/**
 * GET /api/download?id=REPORT_UUID
 * Download CSV report by ID
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const reportId = searchParams.get("id");

        if (!reportId) {
            return NextResponse.json(
                { error: "Missing report ID" },
                { status: 400 }
            );
        }

        // Fetch report from Supabase
        const { data: report, error } = await supabase
            .from("audit_reports")
            .select("*")
            .eq("id", reportId)
            .single();

        if (error || !report) {
            return NextResponse.json(
                { error: "Report not found" },
                { status: 404 }
            );
        }

        // Check if report is expired (24 hours)
        const createdAt = new Date(report.created_at);
        const now = new Date();
        const hoursOld = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

        if (hoursOld > 24) {
            return NextResponse.json(
                { error: "Report has expired. Please generate a new audit." },
                { status: 410 }
            );
        }

        // Generate CSV
        const csvContent = generateCSV(report.report_json);

        // Return CSV file
        const fileName = `soltrait-audit-${report.wallet_address.slice(0, 8)}-${reportId.slice(0, 8)}.csv`;

        return new Response(csvContent, {
            headers: {
                "Content-Type": "text/csv",
                "Content-Disposition": `attachment; filename="${fileName}"`,
                "Cache-Control": "no-cache",
            },
        });
    } catch (error) {
        console.error("Download error:", error);
        return NextResponse.json(
            { error: "Failed to generate download" },
            { status: 500 }
        );
    }
}
