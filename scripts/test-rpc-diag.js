
const { Connection } = require("@solana/web3.js");
const fs = require('fs');
const path = require('path');

// Load env locally manually since dotenv might not be working with node directly
const envPath = path.resolve(process.cwd(), '.env.local');
const envConfig = fs.readFileSync(envPath, 'utf8');
const env = {};
envConfig.split('\n').forEach(line => {
    // Skip comments and empty lines
    if (!line || line.trim().startsWith('#')) return;

    const firstEquals = line.indexOf('=');
    if (firstEquals === -1) return;

    const key = line.substring(0, firstEquals).trim();
    const value = line.substring(firstEquals + 1).trim();

    if (key && value) env[key] = value;
});

const HELIUS_RPC_URL = env.HELIUS_RPC_URL || "";
const PUBLIC_RPC_URL = "https://api.mainnet-beta.solana.com";
const MAGIC_EDEN_API_KEY = env.MAGIC_EDEN_API_KEY || "";

async function testRpc(name, url) {
    console.log(`\nTesting ${name}...`);
    try {
        const connection = new Connection(url, "confirmed");
        const start = Date.now();
        const { blockhash } = await connection.getLatestBlockhash();
        const latency = Date.now() - start;
        console.log(`✅ ${name} Success! Latency: ${latency}ms`);
        return true;
    } catch (error) {
        console.error(`❌ ${name} Failed:`, error.message);
        return false;
    }
}

async function testMagicEden() {
    console.log(`\nTesting Magic Eden API...`);
    // Try to fetch stats for a known collection (DeGods)
    const url = "https://api-mainnet.magiceden.dev/v2/collections/degods/stats";
    try {
        const res = await fetch(url, {
            headers: {
                Authorization: `Bearer ${MAGIC_EDEN_API_KEY}`
            }
        });

        if (res.ok) {
            console.log(`✅ Magic Eden Success! Status: ${res.status}`);
            const data = await res.json();
            console.log("Sample Data:", JSON.stringify(data).slice(0, 100) + "...");
        } else {
            console.error(`❌ Magic Eden Failed: Status ${res.status} - ${res.statusText}`);
            const text = await res.text();
            console.error("Response:", text);
        }
    } catch (error) {
        console.error(`❌ Magic Eden Network Error:`, error.message);
    }
}

async function run() {
    console.log("=== DIAGNOSTIC START ===");
    console.log("Helius URL configured:", HELIUS_RPC_URL ? "Yes" : "No");

    await testRpc("Helius RPC (Current)", HELIUS_RPC_URL);
    await testRpc("Public RPC", PUBLIC_RPC_URL);
    await testMagicEden();

    // Test the new key as Helius
    const potentialHeliusUrl = `https://mainnet.helius-rpc.com/?api-key=16272bb5-f7ab-4bbb-86a7-7db409b552d2`;
    await testRpc("Potential Helius Key (from User)", potentialHeliusUrl);

    console.log("\n=== DIAGNOSTIC END ===");
}

run();
