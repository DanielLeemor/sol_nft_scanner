// CORS headers required for Solana Actions
export const ACTIONS_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept-Encoding",
  "Access-Control-Expose-Headers": "X-Action-Version, X-Blockchain-Ids",
  "Content-Type": "application/json",
};

// Pricing tiers
export const BASE_PRICE_SOL = 0.02;
export const TIER_THRESHOLD = 20;
export const ADDITIONAL_TIER_PRICE = 0.05;
export const ADDITIONAL_TIER_SIZE = 100;

// Rate limiting
export const COOLDOWN_MINUTES = 5;

// Treasury wallet for receiving payments
export const TREASURY_WALLET = process.env.TREASURY_WALLET || "";

// API URLs
export const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL || "";
export const HELIUS_API_KEY = process.env.HELIUS_API_KEY || "";
export const MAGIC_EDEN_API_KEY = process.env.MAGIC_EDEN_API_KEY || "";
export const MAGIC_EDEN_API_BASE = "https://api-mainnet.magiceden.dev/v2";

// App URL
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
