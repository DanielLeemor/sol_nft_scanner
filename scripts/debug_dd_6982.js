
const HELIUS_API_KEY = "6453e526-f8d3-41ec-9af2-1aba3a7ae9ed";
const SIG = "5YvGZ1i8ndeLZ4PMonYtdD3VDtRh2M2eeqRAm6v8fVgd7QwkwXxSCQ9dovArKnLNtmdzqDjPM6Pkam7yUt4oG5PV";

async function debugTx() {
    const url = `https://api.helius.xyz/v0/transactions/?api-key=${HELIUS_API_KEY}`;
    console.log(`Fetching TX ${SIG}...`);

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                transactions: [SIG]
            })
        });

        if (!response.ok) {
            console.error("Failed:", response.status, await response.text());
            return;
        }

        const data = await response.json();
        const tx = data[0];

        console.log("--- FULL TX ---");
        console.log(JSON.stringify(tx, null, 2));

        console.log("--- Native Transfers ---");
        console.log(JSON.stringify(tx.nativeTransfers, null, 2));

        console.log("--- Token Transfers ---");
        console.log(JSON.stringify(tx.tokenTransfers, null, 2));

    } catch (e) {
        console.error(e);
    }
}

debugTx();
