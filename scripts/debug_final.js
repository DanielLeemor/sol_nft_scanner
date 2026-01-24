
const https = require('https');
const fs = require('fs');

const HELIUS_API_KEY = "6453e526-f8d3-41ec-9af2-1aba3a7ae9ed";
// GigaBuds #6253
const MINT = "H15ES1UJG5SVuWEMv7UdfAtVTDs3WeLTtLkvCmHkHuW";

function fetchHistory(mint) {
    const url = `https://api.helius.xyz/v0/addresses/${mint}/transactions?api-key=${HELIUS_API_KEY}`;
    console.log(`Fetching ${url}...`);

    https.get(url, (res) => {
        let data = '';
        console.log('Status:', res.statusCode);

        res.on('data', (chunk) => {
            data += chunk;
        });

        res.on('end', () => {
            console.log('Data Length:', data.length);
            fs.writeFileSync(`history_${mint.substring(0, 4)}.json`, data);

            try {
                const json = JSON.parse(data);
                console.log('Transactions Count:', json.length);
                if (json.length > 0) {
                    console.log('First Tx:', json[0].signature);
                }
            } catch (e) {
                console.error('Parse Error:', e.message);
            }
        });
    }).on('error', (e) => {
        console.error('Error:', e.message);
    });
}

fetchHistory(MINT);
fetchHistory("HvS8PjbPjtVG42DhyLekg7VbJbUteGvakpUK2zJVirwd"); // CryptoTitans #2199
