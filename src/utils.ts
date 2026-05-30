import * as hl from "@nktkas/hyperliquid";
import type { TokenDetailsResponse, TxDetailsResponse } from "@nktkas/hyperliquid/api/info";
import {
  HyperliquidNetwork,
  HyperliquidChainName,
  HyperliquidNetworkToChainName,
  SupportedHyperliquidNetworks,
  HYPERLIQUID_TESTNET,
} from "./constants";

export function assertHyperliquidNetwork(
  network: string,
): asserts network is HyperliquidNetwork {
  if (!network.startsWith("hyperliquid:") || !SupportedHyperliquidNetworks.includes(network as HyperliquidNetwork)) {
    throw new Error(`Unsupported Hyperliquid network: ${network}`);
  }
}

export function getHyperliquidChainName(network: string): HyperliquidChainName {
  assertHyperliquidNetwork(network);
  return HyperliquidNetworkToChainName[network];
}

export function createInfoClient(
  network: string,
  options?: ConstructorParameters<typeof hl.HttpTransport>[0],
): hl.InfoClient {
  assertHyperliquidNetwork(network);
  const transport = new hl.HttpTransport({
    ...options,
    isTestnet: network === HYPERLIQUID_TESTNET,
  });
  return new hl.InfoClient({ transport });
}

export async function fetchTransactionDetails(
  client: hl.InfoClient,
  hash: TxDetailsResponse["tx"]["hash"],
): Promise<TxDetailsResponse["tx"]> {
  const response = await client.txDetails({ hash });
  return response.tx;
}

export interface HyperliquidTokenInfo {
  decimals: number;
  symbol?: string;
  name?: string;
  tokenId?: string;
}

const tokenInfoCache = new Map<string, HyperliquidTokenInfo>();

export async function fetchHyperliquidTokenInfo(
  network: string,
  tokenId: string,
): Promise<HyperliquidTokenInfo> {
  assertHyperliquidNetwork(network);
  const cacheKey = `${network}:${tokenId.toLowerCase()}`;

  const cached = tokenInfoCache.get(cacheKey);
  if (cached) return cached;

  const client = createInfoClient(network);
  const response: TokenDetailsResponse = await client.tokenDetails({ tokenId });

  const info: HyperliquidTokenInfo = {
    decimals: response.weiDecimals,
    symbol: response.name,
    name: response.name,
    tokenId,
  };

  tokenInfoCache.set(cacheKey, info);
  return info;
}

export * from "./constants";
