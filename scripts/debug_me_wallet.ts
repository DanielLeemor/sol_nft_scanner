import "dotenv/config";

const WALLET = "FrY8u2MhPoV3xjSxeZf74ftPMdvthAo9or6fLGwLAXr8";
const ME_API_BASE = "https://api-mainnet.magiceden.dev/v2";

async function run() {
    console.log(`Scanning Magic Eden wallet: ${WALLET}`);

    // Fetch listed tokens specifically
    // Note: The /wallets/:wallet_address/tokens endpoint returns tokens in the wallet
    // asking for list_status=listed implies we want to filter or find specially

    // Try basic wallet tokens first
    const url = `${ME_API_BASE}/wallets/${WALLET}/tokens?offset=0&limit=500`;
    console.log(`Fetching: ${url}`);

    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Status: ${response.status}`);
            const text = await response.text();
            console.error(text);
            return;
        }

        const tokens = await response.json();
        console.log(`Found ${tokens.length} tokens via ME.`);

        tokens.forEach((t: any) => {
            console.log(`[${t.name}]`);
            console.log(`   Mint: ${t.mintAddress}`);
            console.log(`   Listed: ${t.listStatus || 'no'}`);
            console.log(`   Price: ${t.price}`);
            console.log("----------------");
        });

    } catch (err) {
        console.error(err);
    }
}

run();
