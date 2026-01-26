
// Mock types
interface HeliusTransaction {
    signature: string;
    timestamp: number;
    type: string;
    source: string;
    feePayer: string;
    tokenTransfers?: Array<{
        fromUserAccount?: string;
        toUserAccount?: string;
        mint?: string;
        tokenAmount?: number;
    }>;
    nativeTransfers?: Array<{
        fromUserAccount?: string;
        toUserAccount?: string;
        amount?: number;
    }>;
    events: {
        nft?: {
            seller?: string;
            buyer?: string;
            amount?: number;
            type?: string;
        };
    };
    accountData?: Array<{
        account: string;
        nativeBalanceChange: number;
        tokenBalanceChanges: Array<any>;
    }>;
}

// Load from env
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const HELIUS_API_KEY = process.env.HELIUS_API_KEY!;
const MINT = "GCiW18GEkCbGV4DjZtc9f7EVTtykRLCnyjdWo93SZU2s"; // Drifter #6641

// --- COPIED LOGIC START (Updated) ---
const MARKETPLACES = new Set([
    "MAGIC_EDEN",
    "TENSOR",
    "SOLANART",
    "OPENSEA",
    "SNIPER",
    "CORAL_CUBE",
    "HADESWAP",
    "YAWWW"
]);

export function extractLastSale(transactions: HeliusTransaction[], targetMint: string): {
    date: string;
    price: number;
    from: string;
    to: string;
    signature: string;
} | null {
    if (!transactions || transactions.length === 0) {
        return null;
    }

    const candidates: Array<{
        date: string;
        price: number;
        from: string;
        to: string;
        signature: string;
        tier: number; // 4: Explicit, 3: NFT Event, 2: Marketplace, 1: Unknown
        timestamp: number;
    }> = [];

    const SALE_TYPES = new Set(["NFT_SALE", "NFT_MINT", "NFT_AUCTION_SETTLED"]);

    const IGNORE_TYPES = new Set([
        "NFT_BID",
        "NFT_BID_CANCELLED",
        "NFT_LISTING",
        "NFT_CANCEL_LISTING",
        "NFT_OFFER",
        "NFT_OFFER_CANCELLED"
    ]);

    for (let i = 0; i < transactions.length; i++) {
        const tx = transactions[i];

        if (i < 3) {
            console.log(`\n--- Tx Analysis [${i}] ---`);
            console.log(`Sig: ${tx.signature}`);
            console.log(`Type: ${tx.type}, Source: ${tx.source}`);
            console.log(`TokenTransfers: ${tx.tokenTransfers?.length || 0}`);
            if (tx.tokenTransfers) {
                tx.tokenTransfers.forEach(t => console.log(`  - Mint: ${t.mint}, Amt: ${t.tokenAmount}`));
            }
            console.log(`NativeTransfers: ${tx.nativeTransfers?.length || 0}`);
            if (tx.nativeTransfers) {
                tx.nativeTransfers.forEach(t => console.log(`  - ${t.fromUserAccount?.substring(0, 4)}.. -> ${t.toUserAccount?.substring(0, 4)}.. : ${t.amount}`));
            }
            console.log(`Events.NFT: ${JSON.stringify(tx.events?.nft || "None")}`);
            console.log(`AccountData: ${tx.accountData?.length || 0} entries`);
        }

        if (IGNORE_TYPES.has(tx.type)) continue;

        let price = 0;
        let from = "Unknown";
        let to = "Unknown";
        let tier = 1;

        // 1. Identify NFT Movement
        const nftTransfer = tx.tokenTransfers?.find(t => t.mint === targetMint);

        // If NO NFT movement and NO explicit NFT event and NO accountData changes, skip.
        if (!nftTransfer && !tx.events?.nft && (!tx.accountData || tx.accountData.length === 0)) {
            continue;
        }

        const distinctMints = new Set(tx.tokenTransfers?.map(t => t.mint).filter(m => m));
        const isBatch = distinctMints.size > 1;

        if (nftTransfer) {
            from = nftTransfer.fromUserAccount || "Unknown";
            to = nftTransfer.toUserAccount || "Unknown";
        } else {
            // console.log(`Tx ${tx.signature.substring(0,8)}: No NFT Transfer found for target.`);
        }

        // 2. Check for explicit NFT event (Priority 1)
        let eventPrice = 0;
        if (tx.events?.nft && tx.events.nft.amount) {
            const eventType = tx.events.nft.type || tx.type;
            if (SALE_TYPES.has(eventType)) {
                eventPrice = (tx.events.nft.amount || 0) / 1e9;
                from = tx.events.nft.seller || from;
                to = tx.events.nft.buyer || to;
                tier = tx.type === "NFT_SALE" ? 4 : 3;
            }
        }

        // 3. Fallback: Native Flow Analysis (Bidirectional)
        let calculatedPrice = 0;

        // Debug logic
        if (tx.signature.startsWith("5w73qn")) console.log(`Debug ${tx.signature}: isBatch=${isBatch}, from=${from}, to=${to}, nativeLen=${tx.nativeTransfers?.length}`);

        // Standard Native Transfers
        if (!isBatch && tx.nativeTransfers && tx.nativeTransfers.length > 0 && from !== "Unknown" && to !== "Unknown") {
            const outgoingFromBuyer = tx.nativeTransfers
                .filter(t => t.fromUserAccount === to && t.toUserAccount !== to)
                .reduce((sum, t) => sum + (t.amount || 0), 0) / 1e9;
            const incomingToSeller = tx.nativeTransfers
                .filter(t => t.toUserAccount === from && t.fromUserAccount !== from)
                .reduce((sum, t) => sum + (t.amount || 0), 0) / 1e9;
            calculatedPrice = Math.max(outgoingFromBuyer, incomingToSeller);
            // if (tx.signature.startsWith("5w73qn")) console.log(`   CalcPrice: ${calculatedPrice} (Out: ${outgoingFromBuyer}, In: ${incomingToSeller})`);
        }

        // Recalibrate
        if (eventPrice > 0) {
            if (!isBatch && calculatedPrice > eventPrice && calculatedPrice < eventPrice * 1.25) {
                price = calculatedPrice;
            } else {
                price = eventPrice;
            }
        } else {
            price = calculatedPrice;
        }

        // 4. Update Tier
        if (tier < 3) {
            const source = tx.source || "UNKNOWN";
            if (MARKETPLACES.has(source) && price > 0) {
                tier = 2;
            } else if (price > 0) {
                tier = 2;
            }
        }

        if (price > 0) {
            candidates.push({
                date: new Date((tx.timestamp || 0) * 1000).toISOString(),
                price,
                from,
                to,
                signature: tx.signature || "Unknown",
                tier,
                timestamp: tx.timestamp || 0
            });
        }
    }

    const MIN_SALE_THRESHOLD = 0.005;

    const tiersFound = Array.from(new Set(candidates.map(c => c.tier))).sort((a, b) => b - a);

    console.log("\n--- CANDIDATES ---");
    candidates.forEach(c => console.log(JSON.stringify(c)));

    for (const topTier of tiersFound) {
        let tierCandidates = candidates.filter(c => c.tier === topTier);

        if (topTier < 3) {
            tierCandidates = tierCandidates.filter(c => c.price >= MIN_SALE_THRESHOLD);
        }

        if (tierCandidates.length > 0) {
            const winner = tierCandidates.sort((a, b) => b.timestamp - a.timestamp)[0];
            return {
                date: winner.date,
                price: winner.price,
                from: winner.from,
                to: winner.to,
                signature: winner.signature
            };
        }
    }

    const lastTx = transactions[0];
    return {
        date: new Date((lastTx.timestamp || 0) * 1000).toISOString(),
        price: 0,
        from: lastTx.feePayer || "Unknown",
        to: "Unknown",
        signature: lastTx.signature || "Unknown",
    };
}
// --- COPIED LOGIC END ---

async function fetchNFTTransactionHistory(mint: string): Promise<HeliusTransaction[]> {
    const allTransactions: HeliusTransaction[] = [];

    // Fetch just 1 page for test
    // Use /v0/transactions specifically for this test if we need full data
    // But fetchNFTTransactionHistory usually uses /v0/addresses
    // However, /v0/addresses MIGHT NOT return accountData.
    // Let's first try standard history. If accountData is missing, we have a PROBLEM because the app uses /v0/addresses.

    // Wait, the debug script used /v0/transactions (Batch) to get accountData.
    // Does /v0/addresses return accountData?
    // Let's test checking if accountData is present.

    let url = `https://api.helius.xyz/v0/addresses/${mint}/transactions?api-key=${HELIUS_API_KEY}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch history");
    const data = await response.json();
    console.log(`Fetched ${data.length} transactions`);

    // Check if accountData is present in the first few txs
    if (data.length > 0 && !data[0].accountData) {
        console.warn("WARNING: accountData is missing from /v0/addresses response! Logic might fail for MPL Core.");
        // If missing, we might need to batch fetch details for candidates.
    }

    // HACK: for test, fetch details for the specific signature if missing
    // But in prod app, we might need to change fetchNFTTransactionHistory to use getParsedtransaction or something?
    // Actually, Helius Enhanced Transactions /v0/addresses SHOULD include everything provided type=ENHANCED (default).
    // Let's see.

    return data;
}


async function runTest() {
    console.log(`Fetching history for ${MINT}...`);
    try {
        let transactions = await fetchNFTTransactionHistory(MINT);

        // If accountData is missing in transactions, we need to fetch full tx details for the test case
        const targetSig = "5YvGZ1i8ndeLZ4PMonYtdD3VDtRh2M2eeqRAm6v8fVgd7QwkwXxSCQ9dovArKnLNtmdzqDjPM6Pkam7yUt4oG5PV";
        const targetTx = transactions.find(t => t.signature === targetSig);

        if (targetTx && !targetTx.accountData) {
            console.log("Fetching full detail for target TX...");
            const resp = await fetch(`https://api.helius.xyz/v0/transactions/?api-key=${HELIUS_API_KEY}`, {
                method: "POST",
                body: JSON.stringify({ transactions: [targetSig] })
            });
            const details = await resp.json();
            // find index and replace
            const idx = transactions.findIndex(t => t.signature === targetSig);
            transactions[idx] = details[0]; // Replace with full detail
        }

        const result = extractLastSale(transactions, MINT);
        console.log("\n--- RESULT ---");
        console.log(JSON.stringify(result, null, 2));

    } catch (error) {
        console.error("Error:", error);
    }
}

runTest();
