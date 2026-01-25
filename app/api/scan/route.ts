import { NextRequest, NextResponse } from "next/server";
import { fetchWalletNFTs, groupNFTsByCollection } from "@/app/lib/helius";
import { checkRateLimit, recordWalletScan } from "@/app/lib/rate-limit";
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

        // Fetch NFTs
        const nfts = await fetchWalletNFTs(wallet);

        // Record scan removed to prevent rate limiting on view
        // await recordWalletScan(wallet);

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
