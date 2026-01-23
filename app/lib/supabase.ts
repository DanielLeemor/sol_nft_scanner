import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Server-side Supabase client with service role key
export const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Database types
export interface ProcessedSignature {
    signature: string;
    wallet_address: string;
    amount_paid: number;
    nft_count: number;
    selected_collections: string[];
    report_id?: string;
    created_at?: string;
}

export interface AuditReport {
    id: string;
    wallet_address: string;
    report_json: NFTAuditData[];
    status: "complete" | "partial" | "failed";
    error_message?: string;
    created_at?: string;
}

export interface WalletScan {
    wallet_address: string;
    last_scan_at: string;
    scan_count: number;
}

// NFT audit data structure
export interface NFTAuditData {
    wallet_address: string;
    collection_name: string;
    collection_id: string;
    nft_id: string;
    nft_name: string;
    floor_price_sol: number;
    zero_price_trait_count: number;
    highest_trait_price_sol: number;
    highest_trait_name: string;
    last_tx_date: string;
    last_tx_price_sol: number;
    last_tx_from: string;
    last_tx_to: string;
}
