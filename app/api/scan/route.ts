import { NextRequest, NextResponse } from "next/server";
import { fetchWalletNFTs, groupNFTsByCollection, HeliusNFT } from "@/app/lib/helius";
import { fetchWalletTokensME } from "@/app/lib/magiceden";
import { checkRateLimit } from "@/app/lib/rate-limit";
import { calculatePrice, formatPrice } from "@/app/lib/pricing";
import { isValidSolanaAddress } from "@/app/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const wallet = searchParams.get("wallet");

        if (!wallet || !isValidSolanaAddress(wallet)) {
            return NextResponse.json(
                { error: "Invalid wallet address" },
                { status: 400 }
            );
        }

        // Check rate limit
        const rateLimit = await checkRateLimit(wallet);
        if (!rateLimit.allowed) {
            return NextResponse.json(
                {
                    error: "Rate limited",
                    waitMinutes: rateLimit.waitMinutes,
                },
                { status: 429 }
            );
        }

        // Fetch NFTs from BOTH Helius (Wallet) and Magic Eden (Listed/Escrow)
        // We run them in parallel for speed
        console.log(`[Scan] Starting hybrid scan for ${wallet}`);
        const [heliusNfts, meTokens] = await Promise.all([
            fetchWalletNFTs(wallet).catch(err => {
                console.error("[Scan] Helius fetch failed:", err);
                return [];
            }),
            fetchWalletTokensME(wallet).catch(err => {
                console.error("[Scan] ME fetch failed:", err);
                return [];
            })
        ]);

        console.log(`[Scan] Results: Helius=${heliusNfts.length}, ME=${meTokens.length}`);

        // Merge and Deduplicate (Prioritize Helius as it has better metadata structure)
        const nftMap = new Map<string, HeliusNFT>();

        // 1. Add Helius NFTs
        for (const nft of heliusNfts) {
            nftMap.set(nft.id, nft);
        }

        // 2. Add ME Tokens if missing
        for (const token of meTokens) {
            if (!nftMap.has(token.mintAddress)) {
                // Convert ME format to HeliusNFT format
                // ME Token: { mintAddress, name, collection, listStatus, price, ... }
                const converted: HeliusNFT = {
                    id: token.mintAddress,
                    content: {
                        json_uri: token.image, // ME often provides image directly
                        metadata: {
                            name: token.name || "Unknown NFT",
                            symbol: "", // ME doesn't always provide symbol here easily
                            description: "Fetched via Magic Eden (Listed)",
                            attributes: token.attributes || []
                        }
                    },
                    grouping: [
                        {
                            group_key: "collection",
                            // ME returns 'collection' as snake_case symbol usually
                            group_value: token.collection || "Unknown",
                            collection_metadata: {
                                name: token.collectionName || token.collection || "Unknown Collection"
                            }
                        }
                    ],
                    ownership: {
                        owner: wallet // In our logical view, the user owns it
                    }
                };

                nftMap.set(token.mintAddress, converted);
            }
        }

        const nfts = Array.from(nftMap.values());
        console.log(`[Scan] Total unique NFTs: ${nfts.length}`);

        // Group
        const collections = groupNFTsByCollection(nfts);

        // Format for frontend
        const collectionList = Array.from(collections.values())
            .sort((a, b) => b.count - a.count)
            .map((c) => ({
                id: c.id,
                name: c.name,
                count: c.count,
                icon: c.nfts[0]?.content?.json_uri,
                nfts: c.nfts.map((nft) => ({
                    id: nft.id,
                    name: nft.content?.metadata?.name || "Unknown NFT",
                    // We only need basic details for the selection list
                })),
            }));

        const totalNfts = nfts.length;
        const estimatedPrice = calculatePrice(totalNfts);

        return NextResponse.json({
            wallet,
            totalNfts,
            totalCollections: collections.size,
            estimatedPrice,
            estimatedPriceFormatted: formatPrice(estimatedPrice),
            collections: collectionList,
        });
    } catch (error) {
        console.error("Scan API error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Scan failed" },
            { status: 500 }
        );
    }
}
