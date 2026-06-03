import "dotenv/config";

export const HYPERLIQUID_TESTNET = "hyperliquid:testnet" as const;

const DEFAULT_PRICE_USD = "0.000001";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeBasePath(value: string | undefined): string {
  const raw = value?.trim() || "/x402";
  const prefixed = raw.startsWith("/") ? raw : `/${raw}`;
  return prefixed === "/" ? "" : trimTrailingSlash(prefixed);
}

function requireAddress(name: string): `0x${string}` {
  const value = process.env[name]?.trim();
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${name} must be set to a 20-byte 0x-prefixed address`);
  }
  return value as `0x${string}`;
}

export const config = {
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT || 4020),
  publicBaseUrl: trimTrailingSlash(process.env.PUBLIC_BASE_URL || "http://127.0.0.1:4020"),
  basePath: normalizeBasePath(process.env.X402_BASE_PATH),
  payTo: requireAddress("HYPERLIQUID_PAY_TO_ADDRESS"),
  priceUsd: process.env.HYPERLIQUID_PRICE_USD?.trim() || DEFAULT_PRICE_USD,
  payerPrivateKey: process.env.HYPERLIQUID_PAYER_PRIVATE_KEY?.trim() as `0x${string}` | undefined,
};
