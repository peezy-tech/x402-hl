import { C as ClientHyperliquidSigner } from '../../scheme-Cg7Hznjo.js';
export { E as ExactHyperliquidScheme } from '../../scheme-Cg7Hznjo.js';
import { SelectPaymentRequirements, PaymentPolicy, x402Client } from '@x402/core/client';
import { Network } from '@x402/core/types';
import 'viem';
import '@nktkas/hyperliquid/signing';

interface HyperliquidClientConfig {
    signer: ClientHyperliquidSigner;
    paymentRequirementsSelector?: SelectPaymentRequirements;
    policies?: PaymentPolicy[];
    networks?: Network[];
}
declare function registerExactHyperliquidScheme(client: x402Client, config: HyperliquidClientConfig): x402Client;

export { type HyperliquidClientConfig, registerExactHyperliquidScheme };
