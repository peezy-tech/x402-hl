/**
 * Payment requirements accepted by the x402 paywall builder. The paywall
 * package deliberately supports both the v1 `maxAmountRequired` field and the
 * v2 `amount` field, so this structural type mirrors that public contract
 * without pulling its browser wallet toolchain into runtime dependencies.
 */
export interface PaymentRequirements {
  scheme: string;
  network: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: Record<string, unknown>;
  maxAmountRequired?: string;
  description?: string;
  resource?: string;
  mimeType?: string;
  amount?: string;
}

export interface PaymentRequired {
  x402Version: number;
  error?: string;
  resource?: {
    url: string;
    description?: string;
    mimeType?: string;
  };
  accepts: PaymentRequirements[];
  extensions?: Record<string, unknown>;
}

/**
 * Configuration consumed by an x402 paywall network handler.
 *
 * This local structural definition keeps the pre-bundled Hyperliquid handler
 * compatible with `@x402/paywall` without installing that package's wallet
 * toolchain for server-only `x402-hl` consumers.
 */
export interface PaywallConfig {
  appName?: string;
  appLogo?: string;
  currentUrl?: string;
  testnet?: boolean;
  faucetUrls?: Record<string, string>;
}

/** Structurally compatible with `@x402/paywall`'s network-handler contract. */
export interface PaywallNetworkHandler {
  supports(requirement: PaymentRequirements): boolean;
  generateHtml(
    requirement: PaymentRequirements,
    paymentRequired: PaymentRequired,
    config: PaywallConfig,
  ): string;
}
