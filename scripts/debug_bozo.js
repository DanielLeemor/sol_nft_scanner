const fs = require('fs');
const fetch = require('node-fetch');

// Manually parse .env.local
const envContent = fs.readFileSync('.env.local', 'utf8');
const HELIUS_API_KEY = envContent.match(/HELIUS_API_KEY="?([^"\s]+)"?/)?.[1];
const MINT = "fMUXfSVwHHZRWkxpdra33puFXcWtnskV8i5cs62vhDD"; // Bozo #843

async function debugHistory() {
    console.log(`Fetching history for ${MINT} via Enhanced API...`);
    let allTransactions = [];
    let lastSignature = null;

    // Fetch up to 500 transactions (5 pages)
    for (let i = 0; i < 5; i++) {
        let url = `https://api.helius.xyz/v0/addresses/${MINT}/transactions?api-key=${HELIUS_API_KEY}`;
        if (lastSignature) url += `&before=${lastSignature}`;

        const response = await fetch(url);
        if (!response.ok) break;

        const txs = await response.json();
        if (!Array.isArray(txs) || txs.length === 0) break;

        allTransactions.push(...txs);
        lastSignature = txs[txs.length - 1].signature;
        if (txs.length < 100) break;
    }

    console.log(`Analyzing ${allTransactions.length} transactions...`);

    function extractLastSale(transactions) {
        if (!transactions || transactions.length === 0) return null;
        const candidates = [];
        const SALE_TYPES = new Set(["NFT_SALE", "NFT_MINT", "NFT_AUCTION_SETTLED"]);
        const IGNORE_TYPES = new Set(["NFT_BID", "NFT_BID_CANCELLED", "NFT_LISTING", "NFT_CANCEL_LISTING", "NFT_OFFER", "NFT_OFFER_CANCELLED"]);

        for (const tx of transactions) {
            if (IGNORE_TYPES.has(tx.type)) continue;
            let price = 0;
            let from = "Unknown";
            let to = "Unknown";
            let tier = 1;

            if (tx.events?.nft && tx.events.nft.amount) {
                const eventType = tx.events.nft.type || tx.type;
                if (SALE_TYPES.has(eventType)) {
                    price = (tx.events.nft.amount || 0) / 1e9;
                    from = tx.events.nft.seller || "Unknown";
                    to = tx.events.nft.buyer || "Unknown";
                    tier = tx.type === "NFT_SALE" ? 4 : 3;
                }
            }

            if (price === 0 && tx.nativeTransfers && tx.nativeTransfers.length > 0) {
                const outgoing = new Map();
                for (const t of tx.nativeTransfers) {
                    const am = (t.amount || 0) / 1e9;
                    outgoing.set(t.fromUserAccount, (outgoing.get(t.fromUserAccount) || 0) + am);
                }
                const sorted = Array.from(outgoing.entries()).sort((a, b) => b[1] - a[1]);
                const mainPayer = sorted[0];
                if (mainPayer && mainPayer[1] > 0.0001) {
                    price = mainPayer[1];
                    from = mainPayer[0];
                    tier = (tx.source && tx.source !== "UNKNOWN") ? 2 : 1;
                }
            }

            if (price > 0) {
                candidates.push({
                    date: new Date((tx.timestamp || 0) * 1000).toISOString(),
                    price,
                    from,
                    to,
                    signature: tx.signature,
                    tier,
                    timestamp: tx.timestamp || 0
                });
            }
        }

        if (candidates.length === 0) return null;
        const MIN_SALE_THRESHOLD = 0.05;
        const tiersFound = Array.from(new Set(candidates.map(c => c.tier))).sort((a, b) => b - a);

        for (const topTier of tiersFound) {
            let tierCandidates = candidates.filter(c => c.tier === topTier);
            if (topTier < 3) {
                tierCandidates = tierCandidates.filter(c => c.price >= MIN_SALE_THRESHOLD);
            }
            if (tierCandidates.length > 0) {
                return tierCandidates.sort((a, b) => b.timestamp - a.timestamp)[0];
            }
        }
        return null;
    }

    const sale = extractLastSale(allTransactions);
    console.log("\n--- Extraction Winner ---");
    console.log(JSON.stringify(sale, null, 2));
}

debugHistory().catch(console.error);
