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
    parseCollectionValue,
    formatPrice,
    solToLamports,
} from "@/app/lib/pricing";
import { isValidSolanaAddress } from "@/app/lib/utils";
import { supabase } from "@/app/lib/supabase";

/**
 * GET /api/actions/audit
 * Initial scan - returns collection list for selection
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const wallet = searchParams.get("wallet");

        // If no wallet provided, return the initial action for wallet input
        if (!wallet) {
            return NextResponse.json(
                {
                    type: "action",
                    icon: `${APP_URL}/icon.png`,
                    title: "SolNFTscanner Audit",
                    description:
                        "Discover hidden value in your Solana NFT portfolio. Scan your wallet to find traits worth more than floor price.",
                    label: "Enter Wallet",
                    links: {
                        actions: [
                            {
                                type: "transaction",
                                label: "Scan Wallet",
                                href: `/api/actions/audit?wallet={wallet}`,
                                parameters: [
                                    {
                                        type: "text",
                                        name: "wallet",
                                        label: "Enter your Solana wallet address",
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

        // Record the scan
        await recordWalletScan(wallet);

        // Group NFTs by collection
        const collections = groupNFTsByCollection(nfts);

        // Build select options
        const options = Array.from(collections.values())
            .sort((a, b) => b.count - a.count)
            .map((collection) => ({
                label: `${collection.name} (${collection.count} NFTs)`,
                value: `${collection.id}:${collection.count}`,
                selected: true, // Default all selected
            }));

        const totalNfts = nfts.length;
        const estimatedPrice = calculatePrice(totalNfts);

        return NextResponse.json(
            {
                type: "action",
                icon: `${APP_URL}/icon.png`,
                title: "SolNFTscanner Audit",
                description: `Found ${totalNfts} NFTs across ${collections.size} collections. Select collections to audit. Estimated price: ${formatPrice(estimatedPrice)}`,
                label: "Select Collections",
                links: {
                    actions: [
                        {
                            type: "transaction",
                            label: "Audit Selected",
                            href: `/api/actions/audit?wallet=${wallet}`,
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
 * Generate payment transaction based on selected collections
 */
export async function POST(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const wallet = searchParams.get("wallet");

        const body = await request.json();
        const { account, data } = body;

        // account is the user's wallet that will sign the transaction
        if (!account || !isValidSolanaAddress(account)) {
            return NextResponse.json(
                { error: "Invalid account address" },
                { headers: ACTIONS_CORS_HEADERS, status: 400 }
            );
        }

        // Get selected items from the request
        // Support both new mints array and legacy collections format
        let selectedMints: string[] = [];
        let selectedCollections: string[] = [];
        let totalNfts = 0;

        if (data?.mints && Array.isArray(data.mints) && data.mints.length > 0) {
            // New granular selection mode
            selectedMints = data.mints;
            totalNfts = selectedMints.length;
        } else if (data?.collections) {
            // Legacy collection-based selection
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

        // Calculate price
        const priceSol = calculatePrice(totalNfts);
        const priceLamports = solToLamports(priceSol);

        // Build the payment transaction
        const connection = new Connection(HELIUS_RPC_URL, "confirmed");

        const payerPubkey = new PublicKey(account);
        const treasuryPubkey = new PublicKey(TREASURY_WALLET);

        // Get recent blockhash
        const { blockhash, lastValidBlockHeight } =
            await connection.getLatestBlockhash("confirmed");

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

        // Create pending report in Supabase to store selection
        const { data: report } = await supabase
            .from("audit_reports")
            .insert({
                wallet_address: wallet || account,
                status: "partial",
                report_json: {
                    selected_mints: data?.mints || [],
                    selected_collections: selectedCollections
                } as any, // Temporary storage
            })
            .select("id")
            .single();

        return NextResponse.json(
            {
                type: "transaction",
                transaction: serializedTransaction,
                message: `Pay ${formatPrice(priceSol)} to audit ${totalNfts} NFTs`,
                links: {
                    next: {
                        type: "post",
                        href: `/api/actions/reveal?wallet=${wallet || account}&reportId=${report?.id || ""}&amount=${priceSol}`,
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
