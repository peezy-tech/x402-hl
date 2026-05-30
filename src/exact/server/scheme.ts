import {
  PaymentRequirements,
  SchemeNetworkServer,
  Price,
  AssetAmount,
  Network,
} from "@x402/core/types";
import { convertToTokenAmount, numberToDecimalString } from "@x402/core/utils";
import { HyperliquidNetworkConfigs, HyperliquidNetwork } from "../../constants";

export class ExactHyperliquidScheme implements SchemeNetworkServer {
  readonly scheme = "exact";

  async parsePrice(price: Price, network: Network): Promise<AssetAmount> {
    const config = HyperliquidNetworkConfigs[network as HyperliquidNetwork];
    if (!config) throw new Error(`Unsupported Hyperliquid network: ${network}`);

    if (typeof price === "string") {
      const numericValue = price.replace(/[$,]/g, "").trim();
      const atomicAmount = convertToTokenAmount(numericValue, config.decimals);
      return {
        amount: atomicAmount,
        asset: config.token,
        extra: { decimals: config.decimals, tokenSymbol: "USDC" },
      };
    }

    if (typeof price === "number") {
      const atomicAmount = convertToTokenAmount(numberToDecimalString(price), config.decimals);
      return {
        amount: atomicAmount,
        asset: config.token,
        extra: { decimals: config.decimals, tokenSymbol: "USDC" },
      };
    }

    return price;
  }

  async enhancePaymentRequirements(
    requirements: PaymentRequirements,
    supportedKind: { x402Version: number; scheme: string; network: Network; extra?: Record<string, unknown> },
    _facilitatorExtensions: string[],
  ): Promise<PaymentRequirements> {
    const config = HyperliquidNetworkConfigs[requirements.network as HyperliquidNetwork];

    return {
      ...requirements,
      extra: {
        ...requirements.extra,
        ...supportedKind.extra,
        decimals: config?.decimals ?? requirements.extra?.decimals,
        signatureChainId: config?.signatureChainId,
      },
    };
  }

  getAssetDecimals(_asset: string, network: Network): number {
    const config = HyperliquidNetworkConfigs[network as HyperliquidNetwork];
    if (!config) throw new Error(`Unsupported Hyperliquid network: ${network}`);
    return config.decimals;
  }
}
