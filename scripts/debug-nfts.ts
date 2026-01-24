
const HELIUS_API_KEY = "6453e526-f8d3-41ec-9af2-1aba3a7ae9ed";
// CryptoTitans #2199
const MINT = "HvS8PjbPjtVG42DhyLekg7VbJbUteGvakpUK2zJVirwd";

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
        };
    };
}

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

function extractLastSale(transactions: HeliusTransaction[]): {
    date: string;
    price: number;
    from: string;
    to: string;
} | null {
    if (!transactions || transactions.length === 0) return null;

    console.log(`[LOGIC] Scanning ${transactions.length} transactions...`);

    // 1. Strict NFT_SALE Check
    const saleTx = transactions.find(tx => tx.type === "NFT_SALE");
    if (saleTx && saleTx.events?.nft) {
        console.log(`[LOGIC] Found Explicit NFT_SALE in ${saleTx.signature}`);
    }

    let bestCandidate: { tx: HeliusTransaction, price: number, from: string, to: string, tier: number } | null = null;

    for (let i = 0; i < transactions.length; i++) {
        const tx = transactions[i];
        let price = 0;
        let from = "Unknown";
        let to = "Unknown";

        console.log(`\n[LOGIC] Checking Tx ${i} (${tx.signature.substring(0, 8)}...) Type: ${tx.type} Source: ${tx.source}`);

        if (tx.nativeTransfers && tx.nativeTransfers.length > 0) {
            const outgoing = new Map<string, number>();
            const largestTransferBySender = new Map<string, { to: string, amount: number }>();

            for (const t of tx.nativeTransfers) {
                const sender = t.fromUserAccount || "unknown";
                const amount = (t.amount || 0) / 1e9;

                outgoing.set(sender, (outgoing.get(sender) || 0) + amount);
                if (amount > (largestTransferBySender.get(sender)?.amount || 0)) {
                    largestTransferBySender.set(sender, { to: t.toUserAccount || "unknown", amount });
                }
            }

            let maxTotal = 0;
            let mainPayer = "unknown";

            for (const [sender, total] of outgoing.entries()) {
                if (total > maxTotal) {
                    maxTotal = total;
                    mainPayer = sender;
                }
            }

            if (maxTotal > 0.001) {
                price = maxTotal;

                if (tx.tokenTransfers && tx.tokenTransfers.length > 0) {
                    from = tx.tokenTransfers[0].fromUserAccount || from;
                    to = tx.tokenTransfers[0].toUserAccount || to;
                }

                if (to === "Unknown") to = mainPayer;
                if (from === "Unknown") {
                    const recipient = largestTransferBySender.get(mainPayer)?.to;
                    if (recipient) from = recipient;
                } else if (tx.feePayer && from === "Unknown") {
                    from = tx.feePayer;
                }
            }
        }

        if (price > 0) {
            const source = tx.source || "UNKNOWN";
            const currentTier = MARKETPLACES.has(source) ? 2 : 1;

            console.log(`   -> Candidate Found: Price ${price}, Tier ${currentTier}`);

            if (!bestCandidate || currentTier > bestCandidate.tier) {
                console.log(`      (New Best! Prev Tier: ${bestCandidate?.tier})`);
                bestCandidate = {
                    tx,
                    price,
                    from,
                    to,
                    tier: currentTier
                };
            } else {
                console.log(`      (Ignored. Current Best Tier: ${bestCandidate.tier} >= This Tier ${currentTier})`);
            }
        }
    }

    if (bestCandidate) {
        const tx = bestCandidate.tx;
        const txDate = tx.timestamp
            ? new Date(tx.timestamp * 1000).toISOString()
            : new Date().toISOString();

        console.log(`[DEBUG] RETURNING Result: Date=${txDate}, Price=${bestCandidate.price}, Source=${tx.source}`);

        return {
            date: txDate,
            price: bestCandidate.price,
            from: bestCandidate.from,
            to: bestCandidate.to
        };
    }
    return null;
}

async function run() {
    console.log(`Fetching history for ${MINT}...`);
    const url = `https://api.helius.xyz/v0/addresses/${MINT}/transactions?api-key=${HELIUS_API_KEY}`;

    try {
        const res = await fetch(url);
        console.log(`Status: ${res.status} ${res.statusText}`);
        const txs: HeliusTransaction[] = await res.json();

        console.log(`Got ${txs.length} transactions.`);

        // Log timestamps
        txs.slice(0, 10).forEach((tx: any, i: number) => {
            console.log(`[${i}] ${tx.signature} (${tx.type}) [${tx.source}] - ${new Date(tx.timestamp * 1000).toISOString()}`);
        });

        console.log("\nRunning extractLastSale...");
        extractLastSale(txs);
    } catch (e) {
        console.error(e);
    }
}

run();
