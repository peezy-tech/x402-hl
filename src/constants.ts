import { toHex } from "viem";
import { arbitrum } from "viem/chains";

export const HYPERLIQUID_MAINNET = "hyperliquid:mainnet";
export const HYPERLIQUID_TESTNET = "hyperliquid:testnet";
export const HYPERLIQUID_WILDCARD_CAIP2 = "hyperliquid:*";

export type HyperliquidNetwork = typeof HYPERLIQUID_MAINNET | typeof HYPERLIQUID_TESTNET;
export type HyperliquidChainName = "Mainnet" | "Testnet";

export const SupportedHyperliquidNetworks: HyperliquidNetwork[] = [
  HYPERLIQUID_TESTNET,
  HYPERLIQUID_MAINNET,
];

export const HyperliquidNetworkToChainName: Record<HyperliquidNetwork, HyperliquidChainName> = {
  [HYPERLIQUID_TESTNET]: "Testnet",
  [HYPERLIQUID_MAINNET]: "Mainnet",
};

export interface HyperliquidNetworkConfig {
  token: string;
  decimals: number;
  signatureChainId: `0x${string}`;
}

export const HyperliquidNetworkConfigs: Record<HyperliquidNetwork, HyperliquidNetworkConfig> = {
  [HYPERLIQUID_TESTNET]: {
    token: "USDC:0xeb62eee3685fc4c43992febcd9e75443",
    decimals: 8,
    signatureChainId: toHex(arbitrum.id),
  },
  [HYPERLIQUID_MAINNET]: {
    token: "USDC:0x6d1e7cde53ba9467b783cb7c530ce054",
    decimals: 8,
    signatureChainId: toHex(arbitrum.id),
  },
};

export function getExchangeBaseUrl(network: HyperliquidNetwork): string {
  return network === HYPERLIQUID_TESTNET
    ? "https://api.hyperliquid-testnet.xyz/exchange"
    : "https://api.hyperliquid.xyz/exchange";
}

export function isHyperliquidNetwork(network: string): network is HyperliquidNetwork {
  return SupportedHyperliquidNetworks.includes(network as HyperliquidNetwork);
}
