declare const HYPERLIQUID_MAINNET = "hyperliquid:mainnet";
declare const HYPERLIQUID_TESTNET = "hyperliquid:testnet";
declare const HYPERLIQUID_WILDCARD_CAIP2 = "hyperliquid:*";
type HyperliquidNetwork = typeof HYPERLIQUID_MAINNET | typeof HYPERLIQUID_TESTNET;
type HyperliquidChainName = "Mainnet" | "Testnet";
declare const SupportedHyperliquidNetworks: HyperliquidNetwork[];
declare const HyperliquidNetworkToChainName: Record<HyperliquidNetwork, HyperliquidChainName>;
interface HyperliquidNetworkConfig {
    token: string;
    decimals: number;
    signatureChainId: `0x${string}`;
}
declare const HyperliquidNetworkConfigs: Record<HyperliquidNetwork, HyperliquidNetworkConfig>;
declare function getExchangeBaseUrl(network: HyperliquidNetwork): string;
declare function isHyperliquidNetwork(network: string): network is HyperliquidNetwork;

export { HYPERLIQUID_MAINNET as H, SupportedHyperliquidNetworks as S, HYPERLIQUID_TESTNET as a, HYPERLIQUID_WILDCARD_CAIP2 as b, type HyperliquidChainName as c, type HyperliquidNetwork as d, type HyperliquidNetworkConfig as e, HyperliquidNetworkConfigs as f, HyperliquidNetworkToChainName as g, getExchangeBaseUrl as h, isHyperliquidNetwork as i };
