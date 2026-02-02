import { NextRequest, NextResponse } from "next/server";
import {
    Connection,
    PublicKey,
    SystemProgram,
    TransactionMessage,
    VersionedTransaction,
} from "@solana/web3.js";
import {
    ACTIONS_CORS_HEADERS,
    APP_URL,
    HELIUS_RPC_URL,
    TREASURY_WALLET,
} from "@/app/lib/constants";
import { fetchWalletNFTs, groupNFTsByCollection } from "@/app/lib/helius";
import { checkRateLimit, recordWalletScan } from "@/app/lib/rate-limit";
import {
    calculatePrice,
    calculateTotalNfts,
    formatPrice,
    solToLamports,
} from "@/app/lib/pricing";
import { isValidSolanaAddress } from "@/app/lib/utils";
import { supabase } from "@/app/lib/supabase";

/**
 * GET /api/actions/audit
 * Returns initial action or collection selection based on wallet param
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const wallet = searchParams.get("wallet");

        // Step 1: No wallet provided - prompt to scan connected wallet or enter custom
        if (!wallet) {
            return NextResponse.json(
                {
                    type: "action",
                    icon: `${APP_URL}/icon.png`,
                    title: "SolNFTscanner Audit",
                    description:
                        "Discover hidden value in your Solana NFT portfolio. Scan your wallet to find traits worth more than floor price.",
                    label: "Scan Wallet",
                    links: {
                        actions: [
                            {
                                type: "transaction",
                                label: "Scan My Wallet",
                                href: `/api/actions/audit`,
                            },
                            {
                                type: "transaction",
                                label: "Scan Other Wallet",
                                href: `/api/actions/audit`,
                                parameters: [
                                    {
                                        type: "text",
                                        name: "wallet",
                                        label: "Enter wallet address",
                                        required: true,
                                    },
                                ],
                            },
                        ],
                    },
                },
                { headers: ACTIONS_CORS_HEADERS }
            );
        }

        // Step 2: Wallet provided via URL - show collection selection
        // Validate wallet address
        if (!isValidSolanaAddress(wallet)) {
            return NextResponse.json(
                {
                    type: "action",
                    icon: `${APP_URL}/error.png`,
                    title: "Invalid Wallet",
                    description: "The wallet address provided is not valid. Please check and try again.",
                    label: "Try Again",
                    disabled: true,
                    error: {
                        message: "Invalid Solana wallet address",
                    },
                },
                { headers: ACTIONS_CORS_HEADERS, status: 400 }
            );
        }

        // Check rate limit
        const rateLimit = await checkRateLimit(wallet);
        if (!rateLimit.allowed) {
            return NextResponse.json(
                {
                    type: "action",
                    icon: `${APP_URL}/icon.png`,
                    title: "Rate Limited",
                    description: `Please wait ${rateLimit.waitMinutes} minutes before scanning again.`,
                    label: "Wait",
                    disabled: true,
                },
                { headers: ACTIONS_CORS_HEADERS }
            );
        }

        // Fetch NFTs from wallet
        const nfts = await fetchWalletNFTs(wallet);

        if (!nfts || nfts.length === 0) {
            return NextResponse.json(
                {
                    type: "action",
                    icon: `${APP_URL}/icon.png`,
                    title: "No NFTs Found",
                    description:
                        "This wallet doesn't contain any NFTs. Try a different wallet address.",
                    label: "No NFTs",
                    disabled: true,
                },
                { headers: ACTIONS_CORS_HEADERS }
            );
        }

        // Group NFTs by collection
        const collections = groupNFTsByCollection(nfts);

        // Build select options - Limit to Top 5 to ensure << 10KB JSON limit
        const options = Array.from(collections.values())
            .sort((a, b) => b.count - a.count)
            .slice(0, 5) // STRICT LIMIT (User request: fetch fewer, prompt for website)
            .map((collection) => ({
                label: `${collection.name} (${collection.count} NFTs)`,
                value: `${collection.id}:${collection.count}`,
                selected: true,
            }));

        const totalNfts = nfts.length;
        const estimatedPrice = calculatePrice(totalNfts);

        // Return collection selection action
        return NextResponse.json(
            {
                type: "action",
                icon: `${APP_URL}/icon.png`,
                title: "SolNFTscanner Audit",
                description: `Found ${collections.size} collections (${totalNfts} NFTs). Showing Top 5. For full audit, visit SolNFTscanner.com. Est: ${formatPrice(estimatedPrice)}`,
                label: "Select Collections",
                links: {
                    actions: [
                        {
                            type: "transaction",
                            label: "Audit Selected",
                            href: `/api/actions/audit?wallet=${wallet}&step=pay`,
                            parameters: [
                                {
                                    type: "select",
                                    name: "collections",
                                    label: "Select Collections to Audit",
                                    required: true,
                                    options: options,
                                },
                            ],
                        },
                    ],
                },
            },
            { headers: ACTIONS_CORS_HEADERS }
        );
    } catch (error) {
        console.error("GET /api/actions/audit error:", error);
        return NextResponse.json(
            {
                type: "action",
                icon: `${APP_URL}/error.png`,
                title: "Error",
                description:
                    "An error occurred while scanning. Please try again later.",
                label: "Error",
                disabled: true,
                error: {
                    message: error instanceof Error ? error.message : "Unknown error",
                },
            },
            { headers: ACTIONS_CORS_HEADERS, status: 500 }
        );
    }
}

/**
 * POST /api/actions/audit
 * Step 1 (no step param): Receive wallet input, return collections
 * Step 2 (step=pay): Receive collections, return payment transaction
 */
export async function POST(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const wallet = searchParams.get("wallet");
        const step = searchParams.get("step");

        const body = await request.json();
        const { account, data } = body;

        // account is the user's wallet that will sign the transaction
        if (!account || !isValidSolanaAddress(account)) {
            return NextResponse.json(
                { error: "Invalid account address" },
                { headers: ACTIONS_CORS_HEADERS, status: 400 }
            );
        }

        // ============================================================
        // STEP 1: Wallet input received - RETURN INSTANT ACTION (No Fetch)
        // ============================================================
        if (!step || step !== "pay") {
            // Get wallet from data (user input) or URL param
            const inputWallet = data?.wallet || wallet || account;

            if (!inputWallet || !isValidSolanaAddress(inputWallet)) {
                return NextResponse.json(
                    { error: "Invalid wallet address" },
                    { headers: ACTIONS_CORS_HEADERS, status: 400 }
                );
            }

            // Skip Rate Limit Check here (super fast response needed)
            // We checks rate limit before generating the transaction in Step 2

            // Sample Size: 20
            const SAMPLE_SIZE = 20;
            const estimatedPrice = calculatePrice(SAMPLE_SIZE); // Base price for sample

            // Return "Sample Audit" action INSTANTLY
            return NextResponse.json(
                {
                    type: "action",
                    icon: `${APP_URL}/icon.png`,
                    title: "SolNFTscanner Audit",
                    description: `Audit a sample of your portfolio (${SAMPLE_SIZE} NFTs). Full detailed report available on SolNFTscanner.com after scan.`,
                    label: `Audit Sample`,
                    links: {
                        actions: [
                            {
                                type: "transaction",
                                label: `Audit Sample (${formatPrice(estimatedPrice)})`,
                                href: `/api/actions/audit?wallet=${inputWallet}&step=pay&mode=sample`,
                            },
                        ],
                    },
                },
                { headers: ACTIONS_CORS_HEADERS }
            );
        }

        // ============================================================
        // STEP 2: Collections selected - create payment transaction
        // ============================================================
        const targetWallet = body.targetWallet || wallet || account;
        const mode = searchParams.get("mode");

        // Get selected items from the request
        let selectedMints: string[] = [];
        let selectedCollections: string[] = [];
        let totalNfts = 0;

        if (mode === "sample") {
            // SAMPLE MODE: Fetch NFTs and take top 20
            const nfts = await fetchWalletNFTs(targetWallet);
            if (!nfts || nfts.length === 0) {
                return NextResponse.json(
                    { error: "No NFTs found for sample" },
                    { headers: ACTIONS_CORS_HEADERS, status: 400 }
                );
            }
            // Take top 20 mints
            selectedMints = nfts.slice(0, 20).map(n => n.id);
            totalNfts = selectedMints.length;
        } else if (data?.mints && Array.isArray(data.mints) && data.mints.length > 0) {
            selectedMints = data.mints;
            totalNfts = selectedMints.length;
        } else if (data?.collections) {
            selectedCollections = Array.isArray(data.collections)
                ? data.collections
                : [data.collections];
            totalNfts = calculateTotalNfts(selectedCollections);
        }

        if (totalNfts === 0) {
            return NextResponse.json(
                { error: "No NFTs selected" },
                { headers: ACTIONS_CORS_HEADERS, status: 400 }
            );
        }

        // Create pending report in Supabase
        const { data: report } = await supabase
            .from("audit_reports")
            .insert({
                wallet_address: targetWallet,
                created_by_wallet: account,
                status: "partial",
                nft_count: totalNfts,
                report_json: {
                    selected_mints: data?.mints || [],
                    selected_collections: selectedCollections
                },
                pending_mints: selectedMints.length > 0 ? selectedMints : [],
            })
            .select("id")
            .single();

        // Admin bypass check
        if (account === TREASURY_WALLET) {
            return NextResponse.json(
                {
                    bypass: true,
                    reportId: report?.id
                },
                { headers: ACTIONS_CORS_HEADERS }
            );
        }

        // Calculate price
        const priceSol = calculatePrice(totalNfts);
        const priceLamports = solToLamports(priceSol);

        // Build the payment transaction
        let connection: Connection;
        let blockhashInfo: { blockhash: string; lastValidBlockHeight: number };

        try {
            connection = new Connection(HELIUS_RPC_URL, "confirmed");
            blockhashInfo = await connection.getLatestBlockhash("confirmed");
        } catch (rpcError) {
            console.warn("Primary RPC failed, falling back to public endpoint:", rpcError);
            connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
            blockhashInfo = await connection.getLatestBlockhash("confirmed");
        }

        const payerPubkey = new PublicKey(account);
        const treasuryPubkey = new PublicKey(TREASURY_WALLET);
        const { blockhash } = blockhashInfo;

        // Create transfer instruction
        const transferInstruction = SystemProgram.transfer({
            fromPubkey: payerPubkey,
            toPubkey: treasuryPubkey,
            lamports: priceLamports,
        });

        // Create versioned transaction
        const messageV0 = new TransactionMessage({
            payerKey: payerPubkey,
            recentBlockhash: blockhash,
            instructions: [transferInstruction],
        }).compileToV0Message();

        const transaction = new VersionedTransaction(messageV0);

        // Serialize and encode
        const serializedTransaction = Buffer.from(transaction.serialize()).toString(
            "base64"
        );

        return NextResponse.json(
            {
                type: "transaction",
                transaction: serializedTransaction,
                message: `Pay ${formatPrice(priceSol)} to audit ${totalNfts} NFTs`,
                links: {
                    next: {
                        type: "post",
                        href: `/api/actions/reveal?wallet=${targetWallet}&reportId=${report?.id || ""}&amount=${priceSol}`,
                    },
                },
            },
            { headers: ACTIONS_CORS_HEADERS }
        );
    } catch (error) {
        console.error("POST /api/actions/audit error:", error);
        return NextResponse.json(
            {
                error: error instanceof Error ? error.message : "Transaction creation failed",
                details: error instanceof Error ? error.stack : undefined
            },
            { headers: ACTIONS_CORS_HEADERS, status: 500 }
        );
    }
}

export async function OPTIONS() {
    return new Response(null, {
        headers: ACTIONS_CORS_HEADERS,
    });
}
