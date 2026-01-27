import "dotenv/config";
import * as fs from 'fs';
import * as path from 'path';

const WALLET = "FrY8u2MhPoV3xjSxeZf74ftPMdvthAo9or6fLGwLAXr8";

async function run() {
    console.log(`Scanning wallet: ${WALLET}`);

    // We'll call the exact function we use in production
    // NOTE: This will fail if not compiled, so I will rewrite a simpler raw version here
    // to strictly debug the API response without relying on app imports that might fail in script mode

    // Manual env parsing
    const envPath = path.resolve(process.cwd(), '.env.local');
    let rpcUrl = "";
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        const match = content.match(/HELIUS_RPC_URL=(.+)/);
        if (match) rpcUrl = match[1].trim().replace(/["']/g, "");
    }

    const HELIUS_RPC = rpcUrl;
    if (!HELIUS_RPC) throw new Error("No RPC URL found in .env.local");

    const response = await fetch(HELIUS_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: "debug-scan",
            method: "searchAssets",
            params: {
                ownerAddress: WALLET,
                page: 1,
                limit: 1000,
                tokenType: "compressedNft", // Force look for cNFTs
                displayOptions: {
                    showCollectionMetadata: true,
                },
            },
        }),
    });

    const data = await response.json();
    const items = data.result?.items || [];

    console.log(`Found ${items.length} raw items.`);

    // Analyze interfaces
    console.log("\n--- Item Breakdown ---");
    items.forEach((item: any) => {
        const name = item.content?.metadata?.name || "Unknown";
        const iface = item.interface || "No Interface";
        const collection = item.grouping?.find((g: any) => g.group_key === "collection")?.group_value || "None";
        const id = item.id;

        console.log(`[${iface}] ${name}`);
        console.log(`   ID: ${id}`);
        console.log(`   Collection: ${collection}`);

        // Test our filter logic
        const isValid = iface !== "FungibleToken" && iface !== "FungibleAsset";
        console.log(`   Passed Filter? ${isValid ? "✅ YES" : "❌ NO"}`);
        console.log("--------------------------------");
    });
}

run();
