import type {
  PaywallNetworkHandler,
  PaymentRequirements,
  PaymentRequired,
  PaywallConfig,
} from "@x402/paywall";
import { getHyperliquidPaywallHtml } from "./paywall";

export const hyperliquidPaywall: PaywallNetworkHandler = {
  /**
   * Check if this handler supports the given payment requirement.
   *
   * @param requirement - Payment requirement to check
   * @returns True if this handler can process this requirement
   */
  supports(requirement: PaymentRequirements): boolean {
    return requirement.network.startsWith("hyperliquid:");
  },

  /**
   * Generate Hyperliquid-specific paywall HTML.
   *
   * @param requirement - The selected payment requirement
   * @param paymentRequired - Full payment required response
   * @param config - Paywall configuration
   * @returns HTML string for the paywall page
   */
  generateHtml(
    requirement: PaymentRequirements,
    paymentRequired: PaymentRequired,
    config: PaywallConfig,
  ): string {
    const decimals =
      typeof requirement.extra?.decimals === "number" ? requirement.extra.decimals : 6;

    const amount = requirement.amount
      ? parseFloat(requirement.amount) / 10 ** decimals
      : requirement.maxAmountRequired
        ? parseFloat(requirement.maxAmountRequired) / 10 ** decimals
        : 0;

    return getHyperliquidPaywallHtml({
      amount,
      paymentRequired,
      currentUrl:
        config.currentUrl ||
        (typeof paymentRequired.resource?.url === "string" ? paymentRequired.resource.url : ""),
      testnet: config.testnet ?? requirement.network === "hyperliquid:testnet",
      appName: config.appName,
      appLogo: config.appLogo,
    });
  },
};
