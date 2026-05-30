import { x402Client, SelectPaymentRequirements, PaymentPolicy } from "@x402/core/client";
import { Network } from "@x402/core/types";
import { ClientHyperliquidSigner } from "../../signer";
import { ExactHyperliquidScheme } from "./scheme";
import { SupportedHyperliquidNetworks } from "../../constants";

export interface HyperliquidClientConfig {
  signer: ClientHyperliquidSigner;
  paymentRequirementsSelector?: SelectPaymentRequirements;
  policies?: PaymentPolicy[];
  networks?: Network[];
}

export function registerExactHyperliquidScheme(
  client: x402Client,
  config: HyperliquidClientConfig,
): x402Client {
  const networks = config.networks ?? SupportedHyperliquidNetworks;

  networks.forEach(network => {
    client.register(network, new ExactHyperliquidScheme(config.signer));
  });

  if (config.policies) {
    config.policies.forEach(policy => {
      client.registerPolicy(policy);
    });
  }

  return client;
}
