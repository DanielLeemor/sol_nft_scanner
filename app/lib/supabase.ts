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
    report_json: NFTAuditData[] | { selected_mints?: string[]; selected_collections?: string[] };
    status: "pending" | "queued" | "processing" | "partial" | "complete" | "failed";
    nft_count: number;
    pending_mints?: string[];
    priority?: number;
    queue_position?: number;
    started_at?: string;
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
    last_tx_fees_sol?: number;         // Transaction fees (marketplace, royalties)
    last_tx_type?: string;             // Transaction type (NFT_SALE, DEPOSIT, etc.)
    last_tx_from: string;
    last_tx_to: string;
    last_tx_id: string;
    // USD fields (new)
    last_sale_usd?: number;           // Sale price in USD at time of sale
    floor_price_usd?: number;         // Floor price in today's USD
    profit_vs_floor_usd?: number;     // floor_price_usd - last_sale_usd
    highest_trait_usd?: number;       // Highest trait price in today's USD
    profit_vs_trait_usd?: number;     // (highest_trait_usd OR floor_price_usd) - last_sale_usd
    sol_price_at_sale?: number;       // SOL price on sale date (for reference)
    current_sol_price?: number;       // Current SOL price (for reference)
}
