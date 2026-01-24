import { supabase, WalletScan } from "./supabase";
import { COOLDOWN_MINUTES } from "./constants";

/**
 * Check if a wallet is rate limited
 * Wallets can only scan once every COOLDOWN_MINUTES minutes
 */
export async function checkRateLimit(wallet: string): Promise<{
    allowed: boolean;
    waitMinutes?: number;
}> {
    // Bypass rate limit in development mode
    if (process.env.NODE_ENV === "development") {
        return { allowed: true };
    }

    const { data, error } = await supabase
        .from("wallet_scans")
        .select("last_scan_at, scan_count")
        .eq("wallet_address", wallet)
        .single();

    if (error && error.code !== "PGRST116") {
        // PGRST116 = no rows returned (first scan)
        console.error("Rate limit check error:", error);
        return { allowed: true };
    }

    if (data) {
        const lastScan = new Date(data.last_scan_at);
        const cooldownEnd = new Date(lastScan.getTime() + COOLDOWN_MINUTES * 60 * 1000);
        const now = new Date();

        if (now < cooldownEnd) {
            const waitMinutes = Math.ceil((cooldownEnd.getTime() - now.getTime()) / 60000);
            return { allowed: false, waitMinutes };
        }
    }

    return { allowed: true };
}

/**
 * Record a wallet scan (upsert scan record)
 */
export async function recordWalletScan(wallet: string): Promise<void> {
    const { data: existing } = await supabase
        .from("wallet_scans")
        .select("scan_count")
        .eq("wallet_address", wallet)
        .single();

    const scanCount = existing ? existing.scan_count + 1 : 1;

    const { error } = await supabase.from("wallet_scans").upsert({
        wallet_address: wallet,
        last_scan_at: new Date().toISOString(),
        scan_count: scanCount,
    });

    if (error) {
        console.error("Error recording wallet scan:", error);
    }
}
