import { d as HyperliquidNetwork, c as HyperliquidChainName } from './constants-NCiqgml9.js';
export { H as HYPERLIQUID_MAINNET, a as HYPERLIQUID_TESTNET, b as HYPERLIQUID_WILDCARD_CAIP2, e as HyperliquidNetworkConfig, f as HyperliquidNetworkConfigs, g as HyperliquidNetworkToChainName, S as SupportedHyperliquidNetworks, h as getExchangeBaseUrl, i as isHyperliquidNetwork } from './constants-NCiqgml9.js';
import { z } from 'zod';
export { C as ClientHyperliquidSigner, E as ClientScheme, F as FacilitatorHyperliquidSigner, t as toClientHyperliquidSigner } from './scheme-Cg7Hznjo.js';
import * as hl from '@nktkas/hyperliquid';
import { TxDetailsResponse } from '@nktkas/hyperliquid/api/explorer';
export { E as FacilitatorScheme } from './scheme-BvihA5s_.js';
export { E as ServerScheme } from './scheme-BDAZzpLt.js';
import '@x402/core/types';
import 'viem';
import '@nktkas/hyperliquid/signing';

declare const HyperliquidTokenIdRegex: RegExp;
declare const ExactHyperliquidPayloadSchema: z.ZodObject<{
    action: z.ZodObject<{
        type: z.ZodLiteral<"sendAsset">;
        signatureChainId: z.ZodString;
        hyperliquidChain: z.ZodEnum<["Mainnet", "Testnet"]>;
        destination: z.ZodString;
        sourceDex: z.ZodLiteral<"spot">;
        destinationDex: z.ZodLiteral<"spot">;
        token: z.ZodString;
        amount: z.ZodString;
        fromSubAccount: z.ZodLiteral<"">;
        nonce: z.ZodNumber;
    }, "strict", z.ZodTypeAny, {
        type: "sendAsset";
        signatureChainId: string;
        hyperliquidChain: "Mainnet" | "Testnet";
        destination: string;
        sourceDex: "spot";
        destinationDex: "spot";
        token: string;
        amount: string;
        fromSubAccount: "";
        nonce: number;
    }, {
        type: "sendAsset";
        signatureChainId: string;
        hyperliquidChain: "Mainnet" | "Testnet";
        destination: string;
        sourceDex: "spot";
        destinationDex: "spot";
        token: string;
        amount: string;
        fromSubAccount: "";
        nonce: number;
    }>;
    signature: z.ZodObject<{
        r: z.ZodString;
        s: z.ZodString;
        v: z.ZodUnion<[z.ZodLiteral<27>, z.ZodLiteral<28>]>;
    }, "strict", z.ZodTypeAny, {
        r: string;
        s: string;
        v: 27 | 28;
    }, {
        r: string;
        s: string;
        v: 27 | 28;
    }>;
    nonce: z.ZodNumber;
    user: z.ZodString;
}, "strict", z.ZodTypeAny, {
    nonce: number;
    action: {
        type: "sendAsset";
        signatureChainId: string;
        hyperliquidChain: "Mainnet" | "Testnet";
        destination: string;
        sourceDex: "spot";
        destinationDex: "spot";
        token: string;
        amount: string;
        fromSubAccount: "";
        nonce: number;
    };
    signature: {
        r: string;
        s: string;
        v: 27 | 28;
    };
    user: string;
}, {
    nonce: number;
    action: {
        type: "sendAsset";
        signatureChainId: string;
        hyperliquidChain: "Mainnet" | "Testnet";
        destination: string;
        sourceDex: "spot";
        destinationDex: "spot";
        token: string;
        amount: string;
        fromSubAccount: "";
        nonce: number;
    };
    signature: {
        r: string;
        s: string;
        v: 27 | 28;
    };
    user: string;
}>;
type ExactHyperliquidPayload = z.infer<typeof ExactHyperliquidPayloadSchema>;
declare const HyperliquidErrorReasons: readonly ["invalid_x402_version", "unsupported_scheme", "network_mismatch", "invalid_exact_hl_payload", "invalid_exact_hl_payload_signature", "invalid_exact_hl_payload_signer_mismatch", "invalid_exact_hl_payload_nonce_mismatch", "invalid_exact_hl_payload_chain_mismatch", "invalid_exact_hl_payload_asset_mismatch", "invalid_exact_hl_payload_recipient_mismatch", "invalid_exact_hl_payload_amount_mismatch", "invalid_exact_hl_network", "payment_expired", "hl_exchange_error", "hl_tx_not_found", "hl_tx_unconfirmed", "hl_transfer_not_confirmed"];

declare function assertHyperliquidNetwork(network: string): asserts network is HyperliquidNetwork;
declare function getHyperliquidChainName(network: string): HyperliquidChainName;
declare function createInfoClient(network: string, options?: ConstructorParameters<typeof hl.HttpTransport>[0]): hl.InfoClient;
declare function fetchTransactionDetails(network: string, hash: TxDetailsResponse["tx"]["hash"], signal?: AbortSignal): Promise<TxDetailsResponse["tx"]>;
interface HyperliquidTokenInfo {
    decimals: number;
    symbol?: string;
    name?: string;
    tokenId?: string;
}
declare function fetchHyperliquidTokenInfo(network: string, tokenId: string, signal?: AbortSignal): Promise<HyperliquidTokenInfo>;

export { type ExactHyperliquidPayload, ExactHyperliquidPayloadSchema, HyperliquidChainName, HyperliquidErrorReasons, HyperliquidNetwork, HyperliquidTokenIdRegex, type HyperliquidTokenInfo, assertHyperliquidNetwork, createInfoClient, fetchHyperliquidTokenInfo, fetchTransactionDetails, getHyperliquidChainName };
