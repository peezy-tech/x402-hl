import { x402ResourceServer } from "@x402/core/server";
import { ExactHyperliquidScheme } from "./scheme";
import { HyperliquidNetwork, SupportedHyperliquidNetworks } from "../../constants";

export interface HyperliquidServerConfig {
  networks?: HyperliquidNetwork[];
}

export function registerExactHyperliquidScheme(
  server: x402ResourceServer,
  config: HyperliquidServerConfig = {},
): x402ResourceServer {
  const networks = config.networks ?? SupportedHyperliquidNetworks;
  const scheme = new ExactHyperliquidScheme();

  for (const network of networks) {
    server.register(network, scheme);
  }

  return server;
}
