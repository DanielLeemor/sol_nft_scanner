import { NextRequest, NextResponse } from "next/server";
import { TREASURY_WALLET } from "@/app/lib/constants";

export async function POST(request: NextRequest) {
    try {
        const { wallet } = await request.json();

        if (!wallet) {
            return NextResponse.json({ error: "Wallet required" }, { status: 400 });
        }

        // Check if the wallet matches the treasury wallet
        if (wallet === TREASURY_WALLET) {
            return NextResponse.json({ authorized: true });
        }

        return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    } catch (error) {
        console.error("Admin auth error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
