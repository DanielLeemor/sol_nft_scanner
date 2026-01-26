require('dotenv').config({ path: '.env.local' });

const apiKey = process.env.HELIUS_API_KEY;
console.log(`Loaded Key: ${apiKey ? (apiKey.substring(0, 4) + "...") : "UNDEFINED"}`);

async function testKey() {
    const url = `https://api.helius.xyz/v0/token-metadata?api-key=${apiKey}`;
    console.log("Testing API Key with token-metadata endpoint...");

    try {
        // Just try to fetch a known mint to see if we get 200 or 401
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mintAccounts: ["DSX7kjtsPvNcSf3bLKxZFN8sBipWuMSTYfTuL7ayBskB"],
                includeOffChain: true,
                disableCache: false,
            }),
        });

        console.log(`Response Status: ${response.status} ${response.statusText}`);

        if (response.status === 401) {
            console.error("CRITICAL: API Key is unauthorized.");
        } else if (response.ok) {
            const data = await response.json();
            console.log("Success! Data received:", JSON.stringify(data).substring(0, 100) + "...");
        } else {
            console.log("Response text:", await response.text());
        }

    } catch (error) {
        console.error("Network Error:", error);
    }
}

testKey();
