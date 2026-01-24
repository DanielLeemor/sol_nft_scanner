
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || "";
const MINT = "GCiW18GEkCbGV4DjZtc9f7EVTtykRLCnyjdWo93SZU2s"; // Drifter #6641

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

function extractLastSale(transactions: HeliusTransaction[]): {
    date: string;
    price: number;
    from: string;
    to: string;
} | null {
    if (!transactions || transactions.length === 0) return null;

    console.log(`[LOGIC] Scanning ${transactions.length} transactions...`);

    const saleTx = transactions.find(tx => tx.type === "NFT_SALE" || (tx.events?.nft && tx.events.nft.amount));
    if (saleTx && saleTx.events?.nft) {
        console.log(`[LOGIC] Found Explicit NFT_SALE in ${saleTx.signature}`);
        // ... return
    }

    for (let i = 0; i < transactions.length; i++) {
        const tx = transactions[i];
        let price = 0;
        let from = "Unknown";
        let to = "Unknown";

        console.log(`\n[LOGIC] Checking Tx ${i} (${tx.signature.substring(0, 8)}...) Type: ${tx.type}`);

        if (tx.tokenTransfers && tx.tokenTransfers.length > 0) {
            from = tx.tokenTransfers[0].fromUserAccount || from;
            to = tx.tokenTransfers[0].toUserAccount || to;
        }

        if (tx.nativeTransfers && tx.nativeTransfers.length > 0) {
            const outgoing = new Map<string, number>();
            const largestTransferBySender = new Map<string, { to: string, amount: number }>();

            console.log(`[LOGIC] Native Transfers found: ${tx.nativeTransfers.length}`);

            for (const t of tx.nativeTransfers) {
                const sender = t.fromUserAccount || "unknown";
                const amount = (t.amount || 0) / 1e9;
                console.log(`   -> Transfer: ${sender.substring(0, 6)} -> ${t.toUserAccount?.substring(0, 6)} : ${amount}`);

                outgoing.set(sender, (outgoing.get(sender) || 0) + amount);
                if (amount > (largestTransferBySender.get(sender)?.amount || 0)) {
                    largestTransferBySender.set(sender, { to: t.toUserAccount || "unknown", amount });
                }
            }

            let maxTotal = 0;
            let mainPayer = "unknown";

            for (const [sender, total] of outgoing.entries()) {
                console.log(`   -> Sender ${sender.substring(0, 6)} Total: ${total}`);
                if (total > maxTotal) {
                    maxTotal = total;
                    mainPayer = sender;
                }
            }

            if (maxTotal > 0.001) {
                price = maxTotal;
                console.log(`   -> [HIT] New Price Identified: ${price}`);

                if (to === "Unknown") to = mainPayer;
                if (from === "Unknown") {
                    const recipient = largestTransferBySender.get(mainPayer)?.to;
                    if (recipient) from = recipient;
                }
            } else {
                console.log(`   -> [SKIP] MaxTotal ${maxTotal} <= 0.001`);
            }
        }
        else if (tx.feePayer && from === "Unknown") {
            from = tx.feePayer;
        }

        if (price > 0) {
            const txDate = tx.timestamp
                ? new Date(tx.timestamp * 1000).toISOString()
                : new Date().toISOString();

            console.log(`[DEBUG] RETURNING Result: Date=${txDate}, Price=${price}`);

            return {
                date: txDate,
                price,
                from,
                to
            };
        }
    }

    return null;
}

async function run() {
    console.log(`Fetching history for ${MINT}...`);
    const url = `https://api.helius.xyz/v0/addresses/${MINT}/transactions?api-key=${HELIUS_API_KEY}`;
    try {
        const res = await fetch(url);
        const txs: HeliusTransaction[] = await res.json();
        extractLastSale(txs);
    } catch (e) {
        console.error(e);
    }
}

run();
