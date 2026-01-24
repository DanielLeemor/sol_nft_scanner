import { Connection, VersionedTransaction } from "@solana/web3.js";
import { supabase, ProcessedSignature } from "./supabase";
import { HELIUS_RPC_URL, TREASURY_WALLET } from "./constants";
import { lamportsToSol } from "./pricing";

/**
 * Check if a signature has already been processed
 */
export async function isSignatureProcessed(signature: string): Promise<boolean> {
    const { data } = await supabase
        .from("processed_signatures")
        .select("signature")
        .eq("signature", signature)
        .single();

    return !!data;
}

/**
 * Verify payment transaction on-chain
 * Checks that:
 * 1. Transaction exists and is confirmed
 * 2. Payment went to the treasury wallet
 * 3. Amount matches expected
 */
export async function verifyPayment(
    signature: string,
    expectedAmountSol: number
): Promise<{
    verified: boolean;
    actualAmount?: number;
    payer?: string;
    error?: string;
}> {
    try {
        // Check if already processed
        const alreadyProcessed = await isSignatureProcessed(signature);
        if (alreadyProcessed) {
            return { verified: false, error: "Signature already processed" };
        }

        const connection = new Connection(HELIUS_RPC_URL, "confirmed");

        // Fetch transaction with retries
        let tx = null;
        let retries = 3;

        while (!tx && retries > 0) {
            tx = await connection.getTransaction(signature, {
                commitment: "confirmed",
                maxSupportedTransactionVersion: 0,
            });

            if (!tx) {
                await new Promise((r) => setTimeout(r, 2000));
                retries--;
            }
        }

        if (!tx) {
            return { verified: false, error: "Transaction not found" };
        }

        if (tx.meta?.err) {
            return { verified: false, error: "Transaction failed on-chain" };
        }

        // Find the SOL transfer to treasury
        const accountKeys = tx.transaction.message.getAccountKeys();
        const treasuryIndex = accountKeys.staticAccountKeys.findIndex(
            (key) => key.toBase58() === TREASURY_WALLET
        );

        if (treasuryIndex === -1) {
            return { verified: false, error: "Treasury not found in transaction" };
        }

        // Calculate actual payment amount from balance changes
        const preBalance = tx.meta?.preBalances?.[treasuryIndex] || 0;
        const postBalance = tx.meta?.postBalances?.[treasuryIndex] || 0;
        const actualLamports = postBalance - preBalance;
        const actualAmount = lamportsToSol(actualLamports);

        // Allow small tolerance for rounding
        const tolerance = 0.0001;
        if (Math.abs(actualAmount - expectedAmountSol) > tolerance) {
            return {
                verified: false,
                actualAmount,
                error: `Payment amount mismatch: expected ${expectedAmountSol} SOL, got ${actualAmount} SOL`,
            };
        }

        // Get payer address (first signer)
        const payer = accountKeys.staticAccountKeys[0]?.toBase58();

        return { verified: true, actualAmount, payer };
    } catch (error) {
        console.error("Payment verification error:", error);
        return {
            verified: false,
            error: error instanceof Error ? error.message : "Verification failed",
        };
    }
}

/**
 * Record a processed signature to prevent double-fulfillment
 */
export async function recordProcessedSignature(
    signature: string,
    walletAddress: string,
    amountPaid: number,
    nftCount: number,
    selectedCollections: string[],
    reportId?: string
): Promise<void> {
    // Skip recording for Admin Bypass (avoids unique constraint error on "ADMIN_BYPASS" string)
    if (signature.startsWith("ADMIN_BYPASS")) {
        return;
    }

    const { error } = await supabase.from("processed_signatures").insert({
        signature,
        wallet_address: walletAddress,
        amount_paid: amountPaid,
        nft_count: nftCount,
        selected_collections: selectedCollections,
        report_id: reportId,
    });

    if (error) {
        console.error("Error recording signature:", error);
        throw new Error("Failed to record processed signature");
    }
}

/**
 * Get pending payment data from a signature
 */
export async function getPendingPaymentData(
    signature: string
): Promise<ProcessedSignature | null> {
    const { data, error } = await supabase
        .from("processed_signatures")
        .select("*")
        .eq("signature", signature)
        .single();

    if (error || !data) {
        return null;
    }

    return data as ProcessedSignature;
}
