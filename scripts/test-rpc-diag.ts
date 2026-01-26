
import { Connection } from "@solana/web3.js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL || "";
const PUBLIC_RPC_URL = "https://api.mainnet-beta.solana.com";
const MAGIC_EDEN_API_KEY = process.env.MAGIC_EDEN_API_KEY || "";

async function testRpc(name: string, url: string) {
    console.log(`\nTesting ${name}...`);
    try {
        const connection = new Connection(url, "confirmed");
        const start = Date.now();
        const { blockhash } = await connection.getLatestBlockhash();
        const latency = Date.now() - start;
        console.log(`✅ ${name} Success! Latency: ${latency}ms`);
        return true;
    } catch (error: any) {
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
    } catch (error: any) {
        console.error(`❌ Magic Eden Network Error:`, error.message);
    }
}

async function run() {
    console.log("=== DIAGNOSTIC START ===");
    console.log("Helius URL configured:", HELIUS_RPC_URL ? "Yes" : "No");

    await testRpc("Helius RPC", HELIUS_RPC_URL);
    await testRpc("Public RPC", PUBLIC_RPC_URL);
    await testMagicEden();

    console.log("\n=== DIAGNOSTIC END ===");
}

run();
