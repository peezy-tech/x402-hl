import { SettleResponse, Price, PaymentPayload, PaymentRequirements } from '@x402/core/types';
import { RouteConfig } from '@x402/core/server';
import { Hex, Address } from 'viem';
import { IntentExecutionReceipt, HyperEvmExecutionIntent, SignedHyperEvmExecutionIntent, IntentExecutionStatus, ExecutionIntentTypedDataOptions, HyperEvmExecutionIntentInput, IntentExecutionMode, IntentDeclaration, IntentPaymentExtra } from '../index.js';
export { Bytes32Schema, DecimalIntegerStringSchema, EvmAddressSchema, HexSchema, HyperEvmExecutionIntentSchema, IntentDeclarationOptions, IntentDeclarationSchema, IntentExecutionModeSchema, IntentExecutionReceiptSchema, IntentExecutionStatusSchema, IntentPaymentExtraSchema, IntentSigner, JsonRecordSchema, SignExecutionIntentOptions, SignedHyperEvmExecutionIntentSchema, VerifyExecutionIntentOptions, X402_HL_INTENTS_EXTENSION, X402_HL_INTENTS_EXTRA_KEY, X402_HL_INTENT_DOMAIN_NAME, X402_HL_INTENT_DOMAIN_VERSION, X402_HL_INTENT_PRIMARY_TYPE, X402_HL_INTENT_TYPES, X402_HL_INTENT_VERSION, ZERO_ADDRESS, ZERO_BYTES32, attachSignedExecutionIntent, buildExecutionIntentTypedData, createIntentDeclaration, getIntentSignerAddress, hashExecutionIntent, hashIntentMetadata, hashIntentText, normalizeBytes32, normalizeExecutionIntent, readIntentDeclaration, readSignedExecutionIntent, recoverExecutionIntentSigner, signExecutionIntent, stableJson, verifyExecutionIntentSignature } from '../index.js';
import 'zod';

interface IntentQuoteInput extends ExecutionIntentTypedDataOptions {
    id: string;
    intent: HyperEvmExecutionIntentInput;
    price: Price;
    network: `${string}:${string}`;
    payTo: string;
    maxTimeoutSeconds?: number;
    mode?: IntentExecutionMode;
    description?: string;
    mimeType?: string;
    serviceName?: string;
    tags?: string[];
    iconUrl?: string;
    extra?: Record<string, unknown>;
    expiresAt?: number;
}
interface ResolvedIntentQuote {
    id: string;
    intent: HyperEvmExecutionIntent;
    intentHash: Hex;
    declaration: IntentDeclaration;
    paymentExtra: IntentPaymentExtra;
    routeConfig: RouteConfig;
}
interface PaidIntentVerificationInput extends ExecutionIntentTypedDataOptions {
    paymentPayload: PaymentPayload;
    paymentRequirements: PaymentRequirements;
    settleResponse?: SettleResponse;
    requireSamePayer?: boolean;
    now?: number;
}
type PaidIntentVerificationResult = {
    ok: true;
    intent: HyperEvmExecutionIntent;
    signedIntent: SignedHyperEvmExecutionIntent;
    intentHash: Hex;
    signer: Address;
    payer?: string;
    settlement?: SettleResponse;
} | {
    ok: false;
    reason: string;
    message: string;
};
interface IntentExecutionContext {
    intent: HyperEvmExecutionIntent;
    signedIntent: SignedHyperEvmExecutionIntent;
    intentHash: Hex;
    signer: Address;
    payer?: string;
    settlement?: SettleResponse;
}
interface IntentExecutionResult {
    transaction: string;
    network?: string;
    status?: Extract<IntentExecutionStatus, "executed" | "failed">;
    errorReason?: string;
    metadata?: Record<string, unknown>;
}
interface IntentExecutorConfig {
    store?: IntentExecutionStore;
    execute: (context: IntentExecutionContext) => Promise<IntentExecutionResult>;
    typedData?: ExecutionIntentTypedDataOptions;
}
interface IntentExecutionRecord extends IntentExecutionReceipt {
    intent?: HyperEvmExecutionIntent;
    signedIntent?: SignedHyperEvmExecutionIntent;
    settlement?: SettleResponse;
}
interface IntentExecutionStore {
    record(record: IntentExecutionRecord): void;
    get(intentHash: string): IntentExecutionRecord | undefined;
    list(): IntentExecutionRecord[];
}
declare function createIntentQuote(input: IntentQuoteInput): ResolvedIntentQuote;
declare function getIntentPaymentExtra(requirements: PaymentRequirements): IntentPaymentExtra | undefined;
declare function verifyPaidExecutionIntent(input: PaidIntentVerificationInput): Promise<PaidIntentVerificationResult>;
declare function assertPaidExecutionIntent(input: PaidIntentVerificationInput): Promise<Extract<PaidIntentVerificationResult, {
    ok: true;
}>>;
declare function createIntentExecutor(config: IntentExecutorConfig): {
    store: IntentExecutionStore;
    verify(input: PaidIntentVerificationInput): Promise<PaidIntentVerificationResult>;
    execute(input: PaidIntentVerificationInput): Promise<IntentExecutionRecord>;
};
declare class InMemoryIntentExecutionStore implements IntentExecutionStore {
    private readonly records;
    record(record: IntentExecutionRecord): void;
    get(intentHash: string): IntentExecutionRecord | undefined;
    list(): IntentExecutionRecord[];
}
declare function recordPaidIntent(store: IntentExecutionStore, verified: Extract<PaidIntentVerificationResult, {
    ok: true;
}>): IntentExecutionRecord;
declare function recordIntentStatus(store: IntentExecutionStore, verified: Extract<PaidIntentVerificationResult, {
    ok: true;
}>, status: IntentExecutionStatus, details?: Partial<IntentExecutionReceipt>): IntentExecutionRecord;

export { ExecutionIntentTypedDataOptions, HyperEvmExecutionIntent, HyperEvmExecutionIntentInput, InMemoryIntentExecutionStore, IntentDeclaration, type IntentExecutionContext, IntentExecutionMode, IntentExecutionReceipt, type IntentExecutionRecord, type IntentExecutionResult, IntentExecutionStatus, type IntentExecutionStore, type IntentExecutorConfig, IntentPaymentExtra, type IntentQuoteInput, type PaidIntentVerificationInput, type PaidIntentVerificationResult, type ResolvedIntentQuote, SignedHyperEvmExecutionIntent, assertPaidExecutionIntent, createIntentExecutor, createIntentQuote, getIntentPaymentExtra, recordIntentStatus, recordPaidIntent, verifyPaidExecutionIntent };
