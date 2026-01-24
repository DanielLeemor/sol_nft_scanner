
const https = require('https');
const fs = require('fs');

const HELIUS_API_KEY = "6453e526-f8d3-41ec-9af2-1aba3a7ae9ed";
// Primate #1064
const ADDR_1064 = "GmYbqbUoJqYK3nwGvqfqj9CYBmKGsNEX9EjyUBiJWZo";
// Primate #2177 (Check for whitespace)
const ADDR_2177 = "FdHR6GgrVutn1k3XG4SG7YRpTwq1DzzmMtn9hoKfY3".trim();

function postRPC(method, params, filename) {
    const data = JSON.stringify({
        jsonrpc: "2.0",
        id: "test",
        method: method,
        params: params
    });

    const options = {
        hostname: 'mainnet.helius-rpc.com',
        port: 443,
        path: '/?api-key=' + HELIUS_API_KEY,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (d) => { body += d; });
        res.on('end', () => {
            console.log(method + ' to ' + filename + ' done. Status: ' + res.statusCode);
            fs.writeFileSync(filename, body);
        });
    });

    req.on('error', (e) => { console.error('RPC Error:', e.message); });
    req.write(data);
    req.end();
}

function fetchV0(addr, filename) {
    const url = `https://api.helius.xyz/v0/addresses/${addr}/transactions?api-key=${HELIUS_API_KEY}`;
    https.get(url, (res) => {
        let body = '';
        res.on('data', (d) => { body += d; });
        res.on('end', () => {
            console.log('V0 to ' + filename + ' fetched. Status: ' + res.statusCode);
            fs.writeFileSync(filename, body);
        });
    }).on('error', (e) => { console.error('V0 Error:', e.message); });
}

console.log('Starting fetch for #1064:', ADDR_1064);
postRPC('getSignaturesForAddress', [ADDR_1064, { limit: 10 }], 'sigs_1064.json');
fetchV0(ADDR_1064, 'v0_1064.json');

console.log('Starting fetch for #2177:', ADDR_2177);
postRPC('getSignaturesForAddress', [ADDR_2177, { limit: 10 }], 'sigs_2177.json');
fetchV0(ADDR_2177, 'v0_2177.json');
