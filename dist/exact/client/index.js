// src/exact/client/scheme.ts
import { parser, SendAssetRequest, SendAssetTypes } from "@nktkas/hyperliquid/api/exchange";
import { signUserSignedAction } from "@nktkas/hyperliquid/signing";
import { toHex as toHex2 } from "viem";
import { arbitrum as arbitrum2 } from "viem/chains";

// src/utils.ts
import * as hl from "@nktkas/hyperliquid";

// src/constants.ts
import { toHex } from "viem";
import { arbitrum } from "viem/chains";
var HYPERLIQUID_MAINNET = "hyperliquid:mainnet";
var HYPERLIQUID_TESTNET = "hyperliquid:testnet";
var SupportedHyperliquidNetworks = [
  HYPERLIQUID_TESTNET,
  HYPERLIQUID_MAINNET
];
var HyperliquidNetworkToChainName = {
  [HYPERLIQUID_TESTNET]: "Testnet",
  [HYPERLIQUID_MAINNET]: "Mainnet"
};
var HyperliquidNetworkConfigs = {
  [HYPERLIQUID_TESTNET]: {
    token: "USDC:0xeb62eee3685fc4c43992febcd9e75443",
    decimals: 8,
    signatureChainId: toHex(arbitrum.id)
  },
  [HYPERLIQUID_MAINNET]: {
    token: "USDC:0x6d1e7cde53ba9467b783cb7c530ce054",
    decimals: 8,
    signatureChainId: toHex(arbitrum.id)
  }
};

// src/utils.ts
function assertHyperliquidNetwork(network) {
  if (!network.startsWith("hyperliquid:") || !SupportedHyperliquidNetworks.includes(network)) {
    throw new Error(`Unsupported Hyperliquid network: ${network}`);
  }
}
function getHyperliquidChainName(network) {
  assertHyperliquidNetwork(network);
  return HyperliquidNetworkToChainName[network];
}
function createInfoClient(network, options) {
  assertHyperliquidNetwork(network);
  const transport = new hl.HttpTransport({
    ...options,
    isTestnet: network === HYPERLIQUID_TESTNET
  });
  return new hl.InfoClient({ transport });
}
var tokenInfoCache = /* @__PURE__ */ new Map();
async function fetchHyperliquidTokenInfo(network, tokenId) {
  assertHyperliquidNetwork(network);
  const cacheKey = `${network}:${tokenId.toLowerCase()}`;
  const cached = tokenInfoCache.get(cacheKey);
  if (cached) return cached;
  const client = createInfoClient(network);
  const response = await client.tokenDetails({ tokenId });
  const info = {
    decimals: response.weiDecimals,
    symbol: response.name,
    name: response.name,
    tokenId
  };
  tokenInfoCache.set(cacheKey, info);
  return info;
}

// src/exact/client/scheme.ts
var ExactHyperliquidScheme = class {
  constructor(signer) {
    this.signer = signer;
  }
  signer;
  scheme = "exact";
  async createPaymentPayload(x402Version, paymentRequirements) {
    const signerAddress = this.getSignerAddress();
    const decimals = await this.resolveDecimals(paymentRequirements);
    const nonce = Date.now();
    const request = parser(SendAssetRequest)({
      action: {
        type: "sendAsset",
        signatureChainId: toHex2(arbitrum2.id),
        hyperliquidChain: getHyperliquidChainName(paymentRequirements.network),
        destination: paymentRequirements.payTo,
        sourceDex: "spot",
        destinationDex: "spot",
        token: await this.resolveTokenString(paymentRequirements),
        amount: this.formatDecimalAmount(paymentRequirements.amount, decimals),
        fromSubAccount: "",
        nonce
      },
      nonce,
      signature: {
        r: "0x0000000000000000000000000000000000000000000000000000000000000000",
        s: "0x0000000000000000000000000000000000000000000000000000000000000000",
        v: 27
      }
    });
    const signature = await signUserSignedAction({
      wallet: this.signer,
      action: request.action,
      types: SendAssetTypes
    });
    const payload = {
      action: request.action,
      signature,
      nonce,
      user: signerAddress
    };
    return { x402Version, payload };
  }
  getSignerAddress() {
    const address = this.signer.address ?? this.signer.account?.address;
    if (!address?.toLowerCase().startsWith("0x")) {
      throw new Error("Hyperliquid wallet missing address");
    }
    return address;
  }
  formatDecimalAmount(amount, decimals) {
    if (typeof decimals !== "number" || decimals <= 0) return amount;
    const bigAmount = BigInt(amount);
    const divisor = 10n ** BigInt(decimals);
    const whole = bigAmount / divisor;
    const remainder = bigAmount % divisor;
    if (remainder === 0n) return whole.toString();
    const remainderStr = remainder.toString().padStart(decimals, "0").replace(/0+$/, "");
    return `${whole}.${remainderStr}`;
  }
  async resolveDecimals(req) {
    if (typeof req.extra?.decimals === "number") return req.extra.decimals;
    const tokenId = req.asset?.startsWith("0x") ? req.asset : void 0;
    if (!tokenId) return void 0;
    try {
      const info = await fetchHyperliquidTokenInfo(req.network, tokenId);
      return info.decimals;
    } catch {
      return void 0;
    }
  }
  async resolveTokenString(req) {
    if (req.asset.includes(":")) return req.asset;
    const symbol = typeof req.extra?.tokenSymbol === "string" ? req.extra.tokenSymbol : void 0;
    if (symbol) return `${symbol}:${req.asset}`;
    try {
      const info = await fetchHyperliquidTokenInfo(req.network, req.asset);
      if (info.symbol) return `${info.symbol}:${req.asset}`;
    } catch {
    }
    return `TOKEN:${req.asset}`;
  }
};

// src/exact/client/register.ts
function registerExactHyperliquidScheme(client, config) {
  const networks = config.networks ?? SupportedHyperliquidNetworks;
  networks.forEach((network) => {
    client.register(network, new ExactHyperliquidScheme(config.signer));
  });
  if (config.policies) {
    config.policies.forEach((policy) => {
      client.registerPolicy(policy);
    });
  }
  return client;
}
export {
  ExactHyperliquidScheme,
  registerExactHyperliquidScheme
};
//# sourceMappingURL=index.js.map