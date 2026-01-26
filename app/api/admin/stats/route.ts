import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { TREASURY_WALLET } from "@/app/lib/constants";

export async function GET(request: NextRequest) {
    try {
        // Check authorization via header (set by client after wallet verification)
        const walletHeader = request.headers.get("x-wallet-address");
        
        if (!walletHeader || walletHeader !== TREASURY_WALLET) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const range = searchParams.get("range") || "30d";

        // Calculate date range
        let startDate: Date | null = null;
        const now = new Date();
        
        switch (range) {
            case "7d":
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case "30d":
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            case "90d":
                startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                break;
            case "all":
            default:
                startDate = null;
                break;
        }

        // Build query for transactions
        let query = supabase
            .from("processed_signatures")
            .select("*")
            .order("created_at", { ascending: false });

        if (startDate) {
            query = query.gte("created_at", startDate.toISOString());
        }

        const { data: transactions, error: txError } = await query;

        if (txError) {
            console.error("Error fetching transactions:", txError);
            return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
        }

        // Calculate stats
        const totalRevenue = transactions?.reduce((sum, tx) => sum + (tx.amount_paid || 0), 0) || 0;
        const totalTransactions = transactions?.length || 0;
        const totalNftsProcessed = transactions?.reduce((sum, tx) => sum + (tx.nft_count || 0), 0) || 0;
        const uniqueWallets = new Set(transactions?.map(tx => tx.wallet_address) || []);
        const averageOrderValue = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;
        const averageNftsPerOrder = totalTransactions > 0 ? totalNftsProcessed / totalTransactions : 0;

        // Calculate daily stats
        const dailyStatsMap = new Map<string, { revenue: number; transactions: number; nfts: number }>();
        
        transactions?.forEach(tx => {
            const date = new Date(tx.created_at).toISOString().split("T")[0];
            const existing = dailyStatsMap.get(date) || { revenue: 0, transactions: 0, nfts: 0 };
            dailyStatsMap.set(date, {
                revenue: existing.revenue + (tx.amount_paid || 0),
                transactions: existing.transactions + 1,
                nfts: existing.nfts + (tx.nft_count || 0),
            });
        });

        // Fill in missing dates
        const dailyStats: Array<{ date: string; revenue: number; transactions: number; nfts_processed: number }> = [];
        
        if (startDate) {
            const currentDate = new Date(startDate);
            while (currentDate <= now) {
                const dateStr = currentDate.toISOString().split("T")[0];
                const stats = dailyStatsMap.get(dateStr);
                dailyStats.push({
                    date: dateStr,
                    revenue: stats?.revenue || 0,
                    transactions: stats?.transactions || 0,
                    nfts_processed: stats?.nfts || 0,
                });
                currentDate.setDate(currentDate.getDate() + 1);
            }
        } else {
            // For "all time", just use the dates we have
            Array.from(dailyStatsMap.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .forEach(([date, stats]) => {
                    dailyStats.push({
                        date,
                        revenue: stats.revenue,
                        transactions: stats.transactions,
                        nfts_processed: stats.nfts,
                    });
                });
        }

        // Get recent transactions (limited)
        const recentTransactions = transactions?.slice(0, 20) || [];

        return NextResponse.json({
            totalRevenue,
            totalTransactions,
            totalNftsProcessed,
            totalUniqueWallets: uniqueWallets.size,
            averageOrderValue,
            averageNftsPerOrder,
            dailyStats,
            recentTransactions,
        });
    } catch (error) {
        console.error("Admin stats error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
