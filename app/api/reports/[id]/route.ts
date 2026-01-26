import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: reportId } = await params;

        if (!reportId) {
            return NextResponse.json({ error: "Report ID required" }, { status: 400 });
        }

        const { data: report, error } = await supabase
            .from("audit_reports")
            .select("*")
            .eq("id", reportId)
            .single();

        if (error || !report) {
            return NextResponse.json({ error: "Report not found" }, { status: 404 });
        }

        // Check if report is expired (older than 7 days)
        const createdAt = new Date(report.created_at);
        const now = new Date();
        const daysSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
        
        if (daysSinceCreation > 7) {
            return NextResponse.json({ error: "Report has expired" }, { status: 410 });
        }

        return NextResponse.json(report);
    } catch (error) {
        console.error("Error fetching report:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
