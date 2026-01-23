import { PublicKey } from "@solana/web3.js";

/**
 * Validate a Solana wallet address
 */
export function isValidSolanaAddress(address: string): boolean {
    try {
        new PublicKey(address);
        return true;
    } catch {
        return false;
    }
}

/**
 * Shorten a wallet address for display
 */
export function shortenAddress(address: string, chars: number = 4): string {
    if (!address || address.length < chars * 2 + 3) {
        return address;
    }
    return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Retry a function with exponential backoff
 */
export async function fetchWithRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000
): Promise<T> {
    let lastError: Error | null = null;

    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (i < maxRetries - 1) {
                await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
            }
        }
    }

    throw lastError || new Error("Max retries exceeded");
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format a date for display
 */
export function formatDate(date: Date | string): string {
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}
