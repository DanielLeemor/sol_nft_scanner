import { NFTAuditData } from "./supabase";

// CSV column headers
const CSV_HEADERS = [
    "wallet_address",
    "collection_name",
    "collection_id",
    "nft_id",
    "nft_name",
    "floor_price_sol",
    "zero_price_trait_count",
    "highest_trait_price_sol",
    "highest_trait_name",
    "last_tx_date",
    "last_tx_price_sol",
    "last_tx_from",
    "last_tx_to",
];

/**
 * Escape a CSV field value
 * Handles commas, quotes, and newlines
 */
function escapeCSVField(field: string | number | undefined | null): string {
    if (field === undefined || field === null) {
        return "";
    }

    const str = String(field);

    // If the field contains comma, quote, or newline, wrap in quotes
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
    }

    return str;
}

/**
 * Generate CSV content from NFT audit data
 */
export function generateCSV(auditData: NFTAuditData[]): string {
    // Header row
    const headerRow = CSV_HEADERS.join(",");

    // Data rows
    const dataRows = auditData.map((nft) => {
        return [
            escapeCSVField(nft.wallet_address),
            escapeCSVField(nft.collection_name),
            escapeCSVField(nft.collection_id),
            escapeCSVField(nft.nft_id),
            escapeCSVField(nft.nft_name),
            escapeCSVField(nft.floor_price_sol),
            escapeCSVField(nft.zero_price_trait_count),
            escapeCSVField(nft.highest_trait_price_sol),
            escapeCSVField(nft.highest_trait_name),
            escapeCSVField(nft.last_tx_date),
            escapeCSVField(nft.last_tx_price_sol),
            escapeCSVField(nft.last_tx_from),
            escapeCSVField(nft.last_tx_to),
        ].join(",");
    });

    return [headerRow, ...dataRows].join("\n");
}

/**
 * Create a summary of the audit report
 */
export function createAuditSummary(auditData: NFTAuditData[]): {
    totalNfts: number;
    totalCollections: number;
    nftsWithHighValueTraits: number;
    highestTraitValue: number;
    highestTraitNft: string;
} {
    const collections = new Set(auditData.map((nft) => nft.collection_id));

    let nftsWithHighValueTraits = 0;
    let highestTraitValue = 0;
    let highestTraitNft = "";

    for (const nft of auditData) {
        if (nft.highest_trait_price_sol > nft.floor_price_sol) {
            nftsWithHighValueTraits++;
        }

        if (nft.highest_trait_price_sol > highestTraitValue) {
            highestTraitValue = nft.highest_trait_price_sol;
            highestTraitNft = nft.nft_name;
        }
    }

    return {
        totalNfts: auditData.length,
        totalCollections: collections.size,
        nftsWithHighValueTraits,
        highestTraitValue,
        highestTraitNft,
    };
}
