// src/exact/server/scheme.ts
import { convertToTokenAmount, numberToDecimalString } from "@x402/core/utils";

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
    decimals: 6,
    signatureChainId: toHex(arbitrum.id)
  },
  [HYPERLIQUID_MAINNET]: {
    token: "USDC:0xeb62eee3685fc4c43992febcd9e75443",
    decimals: 6,
    signatureChainId: toHex(arbitrum.id)
  }
};

// src/exact/server/scheme.ts
var ExactHyperliquidScheme = class {
  scheme = "exact";
  async parsePrice(price, network) {
    const config = HyperliquidNetworkConfigs[network];
    if (!config) throw new Error(`Unsupported Hyperliquid network: ${network}`);
    if (typeof price === "string") {
      const numericValue = price.replace(/[$,]/g, "").trim();
      const atomicAmount = convertToTokenAmount(numericValue, config.decimals);
      return {
        amount: atomicAmount,
        asset: config.token,
        extra: { decimals: config.decimals, tokenSymbol: "USDC" }
      };
    }
    if (typeof price === "number") {
      const atomicAmount = convertToTokenAmount(numberToDecimalString(price), config.decimals);
      return {
        amount: atomicAmount,
        asset: config.token,
        extra: { decimals: config.decimals, tokenSymbol: "USDC" }
      };
    }
    return price;
  }
  async enhancePaymentRequirements(requirements, supportedKind, _facilitatorExtensions) {
    const config = HyperliquidNetworkConfigs[requirements.network];
    return {
      ...requirements,
      extra: {
        ...requirements.extra,
        ...supportedKind.extra,
        decimals: config?.decimals ?? requirements.extra?.decimals,
        signatureChainId: config?.signatureChainId
      }
    };
  }
  getAssetDecimals(_asset, network) {
    const config = HyperliquidNetworkConfigs[network];
    if (!config) throw new Error(`Unsupported Hyperliquid network: ${network}`);
    return config.decimals;
  }
};

// src/exact/server/register.ts
function registerExactHyperliquidScheme(server, config = {}) {
  const networks = config.networks ?? SupportedHyperliquidNetworks;
  const scheme = new ExactHyperliquidScheme();
  for (const network of networks) {
    server.register(network, scheme);
  }
  return server;
}
export {
  ExactHyperliquidScheme,
  registerExactHyperliquidScheme
};
//# sourceMappingURL=index.js.map