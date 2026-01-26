import { NFTAuditData } from "./supabase";

// CSV column headers - now includes USD fields
const CSV_HEADERS = [
    "wallet_address",
    "collection_name",
    "collection_id",
    "nft_id",
    "nft_name",
    "floor_price_sol",
    "floor_price_usd",
    "zero_price_trait_count",
    "highest_trait_price_sol",
    "highest_trait_usd",
    "highest_trait_name",
    "last_tx_date",
    "last_tx_price_sol",
    "last_sale_usd",
    "sol_price_at_sale",
    "profit_vs_floor_usd",
    "profit_vs_trait_usd",
    "last_tx_from",
    "last_tx_to",
    "last_tx_id",
    "current_sol_price",
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
        // Format SOL values (3 decimal places)
        const formatSol = (val: number | undefined | null) => {
            if (val === undefined || val === null || isNaN(val)) return "0.000";
            return val.toFixed(3);
        };
        
        // Format USD values (2 decimal places)
        const formatUsd = (val: number | undefined | null) => {
            if (val === undefined || val === null || isNaN(val)) return "0.00";
            return val.toFixed(2);
        };

        return [
            escapeCSVField(nft.wallet_address),
            escapeCSVField(nft.collection_name),
            escapeCSVField(nft.collection_id),
            escapeCSVField(nft.nft_id),
            escapeCSVField(nft.nft_name),
            formatSol(nft.floor_price_sol),
            formatUsd(nft.floor_price_usd),
            escapeCSVField(nft.zero_price_trait_count),
            formatSol(nft.highest_trait_price_sol),
            formatUsd(nft.highest_trait_usd),
            escapeCSVField(nft.highest_trait_name),
            escapeCSVField(nft.last_tx_date),
            formatSol(nft.last_tx_price_sol),
            formatUsd(nft.last_sale_usd),
            formatUsd(nft.sol_price_at_sale),
            formatUsd(nft.profit_vs_floor_usd),
            formatUsd(nft.profit_vs_trait_usd),
            escapeCSVField(nft.last_tx_from),
            escapeCSVField(nft.last_tx_to),
            escapeCSVField(nft.last_tx_id),
            formatUsd(nft.current_sol_price),
        ].join(",");
    });

    return [headerRow, ...dataRows].join("\n");
}

/**
 * Create a summary of the audit report
 * Now includes USD totals
 */
export function createAuditSummary(auditData: NFTAuditData[]): {
    totalNfts: number;
    totalCollections: number;
    nftsWithHighValueTraits: number;
    highestTraitValue: number;
    highestTraitNft: string;
    totalFloorValueUsd: number;
    totalProfitLossUsd: number;
    biggestWinnerUsd: { nft: string; profit: number };
    biggestLoserUsd: { nft: string; loss: number };
} {
    const collections = new Set(auditData.map((nft) => nft.collection_id));

    let nftsWithHighValueTraits = 0;
    let highestTraitValue = 0;
    let highestTraitNft = "";
    let totalFloorValueUsd = 0;
    let totalProfitLossUsd = 0;
    let biggestWinnerUsd = { nft: "", profit: -Infinity };
    let biggestLoserUsd = { nft: "", loss: Infinity };

    for (const nft of auditData) {
        if (nft.highest_trait_price_sol > nft.floor_price_sol) {
            nftsWithHighValueTraits++;
        }

        if (nft.highest_trait_price_sol > highestTraitValue) {
            highestTraitValue = nft.highest_trait_price_sol;
            highestTraitNft = nft.nft_name;
        }
        
        // USD calculations
        totalFloorValueUsd += nft.floor_price_usd || 0;
        totalProfitLossUsd += nft.profit_vs_floor_usd || 0;
        
        const profitVsFloor = nft.profit_vs_floor_usd || 0;
        if (profitVsFloor > biggestWinnerUsd.profit) {
            biggestWinnerUsd = { nft: nft.nft_name, profit: profitVsFloor };
        }
        if (profitVsFloor < biggestLoserUsd.loss) {
            biggestLoserUsd = { nft: nft.nft_name, loss: profitVsFloor };
        }
    }

    return {
        totalNfts: auditData.length,
        totalCollections: collections.size,
        nftsWithHighValueTraits,
        highestTraitValue,
        highestTraitNft,
        totalFloorValueUsd: Math.round(totalFloorValueUsd * 100) / 100,
        totalProfitLossUsd: Math.round(totalProfitLossUsd * 100) / 100,
        biggestWinnerUsd: {
            nft: biggestWinnerUsd.nft,
            profit: Math.round(biggestWinnerUsd.profit * 100) / 100,
        },
        biggestLoserUsd: {
            nft: biggestLoserUsd.nft,
            loss: Math.round(biggestLoserUsd.loss * 100) / 100,
        },
    };
}
