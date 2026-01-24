
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || "";
const WALLET = "Awwi6NwVGEHatzZyexPaL7fpgPDwxCWWPpF5D1yy72CP";
const TARGET_NAME = "Drifter #6641";

async function run() {
    console.log(`Scanning wallet ${WALLET} for ${TARGET_NAME}...`);

    // 1. Find Mint
    let mint = "";
    let page = 1;
    while (true) {
        const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: `scan-${page}`,
                method: "getAssetsByOwner",
                params: {
                    ownerAddress: WALLET,
                    page,
                    limit: 1000,
                    displayOptions: { showCollectionMetadata: true }
                },
            }),
        });
        const data = await response.json();
        const items = data.result?.items || [];

        const found = items.find((i: any) => i.content?.metadata?.name === TARGET_NAME);
        if (found) {
            mint = found.id;
            console.log(`Found ${TARGET_NAME}: ${mint}`);
            break;
        }

        if (items.length < 1000) break;
        page++;
    }

    if (!mint) {
        console.log("Could not find NFT in wallet.");
        return;
    }

    // 2. Fetch Transactions
    const url = `https://api.helius.xyz/v0/addresses/${mint}/transactions?api-key=${HELIUS_API_KEY}`;
    console.log(`Fetching history: ${url}`);

    const res = await fetch(url);
    const txData = await res.json();

    console.log("Response Type:", Array.isArray(txData) ? "Array" : typeof txData);
    console.log("Length:", txData.length);

    // Find the specific 0.21 SOL transaction
    const targetSig = "3HLgARFcDtwowf2e3k5J8P6k2Z5x4W6n7q8y9Z"; // Prefix based on screenshot
    // Actually the user screenshot shows "3HLgARFcDtwowf2..." 
    // I don't have the full signature. I will search by timestamp or just dump all and look manually in the output.
    // Better: Dump transactions that have "0.21" in native transfers or token transfers.

    console.log("Searching for 0.21 SOL transaction...");
    txData.forEach((tx: any, i: number) => {
        const isMatch = (tx.nativeTransfers?.some((t: any) => Math.abs((t.amount / 1e9) - 0.21) < 0.01)) ||
            (tx.tokenTransfers?.some((t: any) => t.tokenAmount === 0.21));

        if (isMatch || i < 5) { // Print match OR first 5
            console.log(`\n--- Tx ${i} (Match: ${isMatch}) ---`);
            console.log("Signature:", tx.signature);
            console.log("Type:", tx.type);
            console.log("Timestamp:", new Date(tx.timestamp * 1000).toISOString());
            if (tx.nativeTransfers) {
                console.log("Native Transfers:", JSON.stringify(tx.nativeTransfers, null, 2));
            }
            if (tx.tokenTransfers) {
                console.log("Token Transfers:", JSON.stringify(tx.tokenTransfers, null, 2));
            }
        }
    });
}

run();
