import { NextResponse } from "next/server";
import { ACTIONS_CORS_HEADERS } from "@/app/lib/constants";

/**
 * Actions manifest for Solana Blinks
 * This endpoint is served at /.well-known/actions.json via Netlify redirect
 */
export async function GET() {
    const manifest = {
        rules: [
            {
                pathPattern: "/api/actions/audit",
                apiPath: "/api/actions/audit",
            },
            {
                pathPattern: "/api/actions/reveal",
                apiPath: "/api/actions/reveal",
            },
        ],
    };

    return NextResponse.json(manifest, {
        headers: ACTIONS_CORS_HEADERS,
    });
}

export async function OPTIONS() {
    return new Response(null, {
        headers: ACTIONS_CORS_HEADERS,
    });
}
