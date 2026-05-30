import { x402Facilitator } from "@x402/core/facilitator";
import { ExactHyperliquidScheme } from "./scheme";
import { HyperliquidNetwork, SupportedHyperliquidNetworks } from "../../constants";

export interface HyperliquidFacilitatorConfig {
  networks?: HyperliquidNetwork[];
}

export function registerExactHyperliquidScheme(
  facilitator: x402Facilitator,
  config: HyperliquidFacilitatorConfig = {},
): x402Facilitator {
  const networks = config.networks ?? SupportedHyperliquidNetworks;
  const scheme = new ExactHyperliquidScheme();

  for (const network of networks) {
    facilitator.register(network, scheme);
  }

  return facilitator;
}
