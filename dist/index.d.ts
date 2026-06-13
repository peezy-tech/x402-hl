import { d as HyperliquidNetwork, c as HyperliquidChainName } from './constants-NCiqgml9.js';
export { H as HYPERLIQUID_MAINNET, a as HYPERLIQUID_TESTNET, b as HYPERLIQUID_WILDCARD_CAIP2, e as HyperliquidNetworkConfig, f as HyperliquidNetworkConfigs, g as HyperliquidNetworkToChainName, S as SupportedHyperliquidNetworks, h as getExchangeBaseUrl, i as isHyperliquidNetwork } from './constants-NCiqgml9.js';
import { z } from 'zod';
export { C as ClientHyperliquidSigner, E as ClientScheme, F as FacilitatorHyperliquidSigner, t as toClientHyperliquidSigner } from './scheme-Cg7Hznjo.js';
import * as hl from '@nktkas/hyperliquid';
import { TxDetailsResponse } from '@nktkas/hyperliquid/api/info';
export { E as FacilitatorScheme } from './scheme-CKEOHJsd.js';
export { E as ServerScheme } from './scheme-BDAZzpLt.js';
import '@x402/core/types';
import 'viem';
import '@nktkas/hyperliquid/signing';

declare const HyperliquidTokenIdRegex: RegExp;
declare const ExactHyperliquidPayloadSchema: z.ZodObject<{
    action: z.ZodRecord<z.ZodString, z.ZodAny>;
    signature: z.ZodUnion<[z.ZodString, z.ZodObject<{
        r: z.ZodString;
        s: z.ZodString;
        v: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        r: string;
        s: string;
        v: number;
    }, {
        r: string;
        s: string;
        v: number;
    }>]>;
    nonce: z.ZodNumber;
    user: z.ZodString;
}, "strip", z.ZodTypeAny, {
    action: Record<string, any>;
    signature: string | {
        r: string;
        s: string;
        v: number;
    };
    nonce: number;
    user: string;
}, {
    action: Record<string, any>;
    signature: string | {
        r: string;
        s: string;
        v: number;
    };
    nonce: number;
    user: string;
}>;
type ExactHyperliquidPayload = z.infer<typeof ExactHyperliquidPayloadSchema>;
declare const HyperliquidErrorReasons: readonly ["invalid_x402_version", "unsupported_scheme", "network_mismatch", "invalid_exact_hl_payload", "invalid_exact_hl_payload_signature", "invalid_exact_hl_payload_asset_mismatch", "invalid_exact_hl_payload_recipient_mismatch", "invalid_exact_hl_payload_amount_mismatch", "invalid_exact_hl_network", "hl_exchange_error", "hl_tx_not_found", "hl_tx_unconfirmed"];

declare function assertHyperliquidNetwork(network: string): asserts network is HyperliquidNetwork;
declare function getHyperliquidChainName(network: string): HyperliquidChainName;
declare function createInfoClient(network: string, options?: ConstructorParameters<typeof hl.HttpTransport>[0]): hl.InfoClient;
declare function fetchTransactionDetails(client: hl.InfoClient, hash: TxDetailsResponse["tx"]["hash"]): Promise<TxDetailsResponse["tx"]>;
interface HyperliquidTokenInfo {
    decimals: number;
    symbol?: string;
    name?: string;
    tokenId?: string;
}
declare function fetchHyperliquidTokenInfo(network: string, tokenId: string): Promise<HyperliquidTokenInfo>;

export { type ExactHyperliquidPayload, ExactHyperliquidPayloadSchema, HyperliquidChainName, HyperliquidErrorReasons, HyperliquidNetwork, HyperliquidTokenIdRegex, type HyperliquidTokenInfo, assertHyperliquidNetwork, createInfoClient, fetchHyperliquidTokenInfo, fetchTransactionDetails, getHyperliquidChainName };
