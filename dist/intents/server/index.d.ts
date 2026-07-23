import { HyperEvmExecutionIntentInput, HyperEvmExecutionIntent, IntentDeclaration, IntentPaymentExtra, ExecutionIntentDomain, IntentFailureReason, IntentExecutionReceipt, IntentExecutionStatus, JsonValue } from '../index.js';
export { Bytes32Schema, CanonicalPaymentRequirements, DecimalIntegerStringSchema, EvmAddressSchema, ExecutionIntentDomainSchema, ExecutionIntentPaymentBinding, HexSchema, HyperEvmExecutionIntentSchema, IntentApplicationSchema, IntentBindingFailure, IntentBindingResult, IntentDeclarationOptions, IntentDeclarationSchema, IntentExecutionMode, IntentExecutionModeSchema, IntentExecutionReceiptSchema, IntentExecutionStatusSchema, IntentFailure, IntentFailureReasonSchema, IntentFailureSchema, IntentPaymentExtraSchema, IntentSigner, JsonRecordSchema, JsonValueSchema, NonZeroEvmAddressSchema, SignExecutionIntentOptions, SignedHyperEvmExecutionIntent, SignedHyperEvmExecutionIntentSchema, TERMINAL_INTENT_EXECUTION_STATUSES, X402_HL_INTENTS_EXTENSION, X402_HL_INTENTS_EXTRA_KEY, X402_HL_INTENT_DOMAIN_NAME, X402_HL_INTENT_DOMAIN_VERSION, X402_HL_INTENT_PRIMARY_TYPE, X402_HL_INTENT_TYPES, X402_HL_INTENT_VERSION, ZERO_ADDRESS, ZERO_BYTES32, attachSignedExecutionIntent, buildExecutionIntentTypedData, canonicalizePaymentRequirements, createIntentDeclaration, createIntentPaymentExtra, getIntentSignerAddress, hashExecutionIntent, hashExecutionIntentTemplate, hashIntentMetadata, hashIntentText, hashPaymentRequirements, isTerminalIntentExecutionStatus, normalizeBytes32, normalizeExecutionIntent, readIntentDeclaration, readIntentPaymentExtra, readSignedExecutionIntent, recoverExecutionIntentSigner, signExecutionIntent, stableJson, verifyExecutionIntentSignature, verifyIntentPaymentExtra } from '../index.js';
import { Price, SettleResponse, PaymentPayload, PaymentRequirements } from '@x402/core/types';
import { RouteConfig } from '@x402/core/server';
import { Hex, Address } from 'viem';
import * as zod from 'zod';

interface IntentQuoteInput {
    id: string;
    intent: HyperEvmExecutionIntentInput;
    price: Price;
    network: `${string}:${string}`;
    payTo: string;
    maxTimeoutSeconds?: number;
    description?: string;
    mimeType?: string;
    serviceName?: string;
    tags?: string[];
    iconUrl?: string;
    extra?: Record<string, unknown>;
}
interface ResolvedIntentQuote {
    id: string;
    intent: HyperEvmExecutionIntent;
    intentTemplateHash: Hex;
    declaration: IntentDeclaration;
    paymentExtra: IntentPaymentExtra;
    routeConfig: RouteConfig;
}
declare function createIntentQuote(input: IntentQuoteInput): ResolvedIntentQuote;

interface PaidIntentVerificationInput {
    paymentPayload: PaymentPayload;
    paymentRequirements: PaymentRequirements;
    settleResponse?: SettleResponse;
    expectedDomain: ExecutionIntentDomain;
    expectedQuoteId: string;
    expectedIntentTemplateHash: Hex | string;
    requireSamePayer?: boolean;
    now?: number;
}
interface VerifiedPaidExecutionIntent {
    intent: HyperEvmExecutionIntent;
    intentHash: Hex;
    intentTemplateHash: Hex;
    paymentRequirementsHash: Hex;
    signer: Address;
    payer: Address;
    settlement: SettleResponse;
}
type PaidIntentVerificationResult = ({
    ok: true;
} & VerifiedPaidExecutionIntent) | {
    ok: false;
    reason: IntentFailureReason;
    message: string;
};
declare function verifyPaidExecutionIntent(input: PaidIntentVerificationInput): Promise<PaidIntentVerificationResult>;
declare function assertPaidExecutionIntent(input: PaidIntentVerificationInput): Promise<VerifiedPaidExecutionIntent>;

declare const IntentExecutionRecordSchema: zod.ZodObject<{
    version: zod.ZodLiteral<2>;
    revision: zod.ZodNumber;
    status: zod.ZodEnum<["paid", "execution_claimed", "execution_submitted", "executed", "execution_failed", "refund_pending", "refund_claimed", "refund_submitted", "refunded", "refund_failed", "manual_intervention"]>;
    intentHash: zod.ZodString;
    intentTemplateHash: zod.ZodString;
    paymentRequirementsHash: zod.ZodString;
    quoteId: zod.ZodString;
    application: zod.ZodString;
    gateway: zod.ZodString;
    payer: zod.ZodString;
    paymentScheme: zod.ZodString;
    paymentNetwork: zod.ZodString;
    paymentAsset: zod.ZodString;
    paymentAmount: zod.ZodString;
    paymentPayTo: zod.ZodString;
    paymentTransaction: zod.ZodString;
    executionNetwork: zod.ZodOptional<zod.ZodString>;
    executionTransaction: zod.ZodOptional<zod.ZodString>;
    refundNetwork: zod.ZodOptional<zod.ZodString>;
    refundTransaction: zod.ZodOptional<zod.ZodString>;
    executionAttempts: zod.ZodNumber;
    refundAttempts: zod.ZodNumber;
    failure: zod.ZodOptional<zod.ZodObject<{
        reason: zod.ZodEnum<["malformed_extension_payload", "missing_execution_intent", "missing_intent_requirement", "missing_settlement", "unsuccessful_settlement", "missing_settled_payer", "missing_settlement_transaction", "settlement_network_mismatch", "settlement_amount_mismatch", "payment_payload_requirements_mismatch", "payment_requirements_hash_mismatch", "intent_template_hash_mismatch", "intent_hash_mismatch", "quote_mismatch", "application_mismatch", "gateway_mismatch", "chain_mismatch", "target_mismatch", "calldata_mismatch", "value_mismatch", "recipient_mismatch", "refund_address_mismatch", "gas_limit_mismatch", "slippage_limit_mismatch", "deadline_mismatch", "nonce_mismatch", "metadata_mismatch", "execution_intent_expired", "invalid_execution_intent_signature", "execution_intent_payer_mismatch", "store_conflict", "policy_denied", "policy_binding_mismatch", "simulation_failed", "gas_cost_exceeded", "slippage_exceeded", "execution_failed", "execution_uncertain", "refund_failed", "refund_uncertain", "invalid_state"]>;
        message: zod.ZodString;
        retryable: zod.ZodBoolean;
    }, "strip", zod.ZodTypeAny, {
        message: string;
        reason: "execution_failed" | "refund_failed" | "malformed_extension_payload" | "missing_execution_intent" | "missing_intent_requirement" | "missing_settlement" | "unsuccessful_settlement" | "missing_settled_payer" | "missing_settlement_transaction" | "settlement_network_mismatch" | "settlement_amount_mismatch" | "payment_payload_requirements_mismatch" | "payment_requirements_hash_mismatch" | "intent_template_hash_mismatch" | "intent_hash_mismatch" | "quote_mismatch" | "application_mismatch" | "gateway_mismatch" | "chain_mismatch" | "target_mismatch" | "calldata_mismatch" | "value_mismatch" | "recipient_mismatch" | "refund_address_mismatch" | "gas_limit_mismatch" | "slippage_limit_mismatch" | "deadline_mismatch" | "nonce_mismatch" | "metadata_mismatch" | "execution_intent_expired" | "invalid_execution_intent_signature" | "execution_intent_payer_mismatch" | "store_conflict" | "policy_denied" | "policy_binding_mismatch" | "simulation_failed" | "gas_cost_exceeded" | "slippage_exceeded" | "execution_uncertain" | "refund_uncertain" | "invalid_state";
        retryable: boolean;
    }, {
        message: string;
        reason: "execution_failed" | "refund_failed" | "malformed_extension_payload" | "missing_execution_intent" | "missing_intent_requirement" | "missing_settlement" | "unsuccessful_settlement" | "missing_settled_payer" | "missing_settlement_transaction" | "settlement_network_mismatch" | "settlement_amount_mismatch" | "payment_payload_requirements_mismatch" | "payment_requirements_hash_mismatch" | "intent_template_hash_mismatch" | "intent_hash_mismatch" | "quote_mismatch" | "application_mismatch" | "gateway_mismatch" | "chain_mismatch" | "target_mismatch" | "calldata_mismatch" | "value_mismatch" | "recipient_mismatch" | "refund_address_mismatch" | "gas_limit_mismatch" | "slippage_limit_mismatch" | "deadline_mismatch" | "nonce_mismatch" | "metadata_mismatch" | "execution_intent_expired" | "invalid_execution_intent_signature" | "execution_intent_payer_mismatch" | "store_conflict" | "policy_denied" | "policy_binding_mismatch" | "simulation_failed" | "gas_cost_exceeded" | "slippage_exceeded" | "execution_uncertain" | "refund_uncertain" | "invalid_state";
        retryable: boolean;
    }>>;
    claimToken: zod.ZodOptional<zod.ZodString>;
    createdAt: zod.ZodString;
    updatedAt: zod.ZodString;
    metadata: zod.ZodOptional<zod.ZodRecord<zod.ZodString, zod.ZodType<JsonValue, zod.ZodTypeDef, JsonValue>>>;
} & {
    intent: zod.ZodObject<{
        version: zod.ZodLiteral<2>;
        application: zod.ZodString;
        gateway: zod.ZodEffects<zod.ZodString, string, string>;
        user: zod.ZodString;
        chainId: zod.ZodNumber;
        target: zod.ZodString;
        callData: zod.ZodString;
        value: zod.ZodString;
        recipient: zod.ZodString;
        refundAddress: zod.ZodString;
        maxGasCost: zod.ZodString;
        maxSlippageBps: zod.ZodNumber;
        deadline: zod.ZodNumber;
        nonce: zod.ZodString;
        quoteId: zod.ZodString;
        metadataHash: zod.ZodString;
        metadata: zod.ZodOptional<zod.ZodRecord<zod.ZodString, zod.ZodType<JsonValue, zod.ZodTypeDef, JsonValue>>>;
    }, "strip", zod.ZodTypeAny, {
        value: string;
        application: string;
        gateway: string;
        version: 2;
        user: string;
        chainId: number;
        target: string;
        callData: string;
        recipient: string;
        refundAddress: string;
        maxGasCost: string;
        maxSlippageBps: number;
        deadline: number;
        nonce: string;
        quoteId: string;
        metadataHash: string;
        metadata?: Record<string, JsonValue> | undefined;
    }, {
        value: string;
        application: string;
        gateway: string;
        version: 2;
        user: string;
        chainId: number;
        target: string;
        callData: string;
        recipient: string;
        refundAddress: string;
        maxGasCost: string;
        maxSlippageBps: number;
        deadline: number;
        nonce: string;
        quoteId: string;
        metadataHash: string;
        metadata?: Record<string, JsonValue> | undefined;
    }>;
}, "strip", zod.ZodTypeAny, {
    status: "paid" | "execution_claimed" | "execution_submitted" | "executed" | "execution_failed" | "refund_pending" | "refund_claimed" | "refund_submitted" | "refunded" | "refund_failed" | "manual_intervention";
    application: string;
    gateway: string;
    version: 2;
    quoteId: string;
    intent: {
        value: string;
        application: string;
        gateway: string;
        version: 2;
        user: string;
        chainId: number;
        target: string;
        callData: string;
        recipient: string;
        refundAddress: string;
        maxGasCost: string;
        maxSlippageBps: number;
        deadline: number;
        nonce: string;
        quoteId: string;
        metadataHash: string;
        metadata?: Record<string, JsonValue> | undefined;
    };
    paymentRequirementsHash: string;
    intentHash: string;
    intentTemplateHash: string;
    revision: number;
    payer: string;
    paymentScheme: string;
    paymentNetwork: string;
    paymentAsset: string;
    paymentAmount: string;
    paymentPayTo: string;
    paymentTransaction: string;
    executionAttempts: number;
    refundAttempts: number;
    createdAt: string;
    updatedAt: string;
    metadata?: Record<string, JsonValue> | undefined;
    executionNetwork?: string | undefined;
    executionTransaction?: string | undefined;
    refundNetwork?: string | undefined;
    refundTransaction?: string | undefined;
    failure?: {
        message: string;
        reason: "execution_failed" | "refund_failed" | "malformed_extension_payload" | "missing_execution_intent" | "missing_intent_requirement" | "missing_settlement" | "unsuccessful_settlement" | "missing_settled_payer" | "missing_settlement_transaction" | "settlement_network_mismatch" | "settlement_amount_mismatch" | "payment_payload_requirements_mismatch" | "payment_requirements_hash_mismatch" | "intent_template_hash_mismatch" | "intent_hash_mismatch" | "quote_mismatch" | "application_mismatch" | "gateway_mismatch" | "chain_mismatch" | "target_mismatch" | "calldata_mismatch" | "value_mismatch" | "recipient_mismatch" | "refund_address_mismatch" | "gas_limit_mismatch" | "slippage_limit_mismatch" | "deadline_mismatch" | "nonce_mismatch" | "metadata_mismatch" | "execution_intent_expired" | "invalid_execution_intent_signature" | "execution_intent_payer_mismatch" | "store_conflict" | "policy_denied" | "policy_binding_mismatch" | "simulation_failed" | "gas_cost_exceeded" | "slippage_exceeded" | "execution_uncertain" | "refund_uncertain" | "invalid_state";
        retryable: boolean;
    } | undefined;
    claimToken?: string | undefined;
}, {
    status: "paid" | "execution_claimed" | "execution_submitted" | "executed" | "execution_failed" | "refund_pending" | "refund_claimed" | "refund_submitted" | "refunded" | "refund_failed" | "manual_intervention";
    application: string;
    gateway: string;
    version: 2;
    quoteId: string;
    intent: {
        value: string;
        application: string;
        gateway: string;
        version: 2;
        user: string;
        chainId: number;
        target: string;
        callData: string;
        recipient: string;
        refundAddress: string;
        maxGasCost: string;
        maxSlippageBps: number;
        deadline: number;
        nonce: string;
        quoteId: string;
        metadataHash: string;
        metadata?: Record<string, JsonValue> | undefined;
    };
    paymentRequirementsHash: string;
    intentHash: string;
    intentTemplateHash: string;
    revision: number;
    payer: string;
    paymentScheme: string;
    paymentNetwork: string;
    paymentAsset: string;
    paymentAmount: string;
    paymentPayTo: string;
    paymentTransaction: string;
    executionAttempts: number;
    refundAttempts: number;
    createdAt: string;
    updatedAt: string;
    metadata?: Record<string, JsonValue> | undefined;
    executionNetwork?: string | undefined;
    executionTransaction?: string | undefined;
    refundNetwork?: string | undefined;
    refundTransaction?: string | undefined;
    failure?: {
        message: string;
        reason: "execution_failed" | "refund_failed" | "malformed_extension_payload" | "missing_execution_intent" | "missing_intent_requirement" | "missing_settlement" | "unsuccessful_settlement" | "missing_settled_payer" | "missing_settlement_transaction" | "settlement_network_mismatch" | "settlement_amount_mismatch" | "payment_payload_requirements_mismatch" | "payment_requirements_hash_mismatch" | "intent_template_hash_mismatch" | "intent_hash_mismatch" | "quote_mismatch" | "application_mismatch" | "gateway_mismatch" | "chain_mismatch" | "target_mismatch" | "calldata_mismatch" | "value_mismatch" | "recipient_mismatch" | "refund_address_mismatch" | "gas_limit_mismatch" | "slippage_limit_mismatch" | "deadline_mismatch" | "nonce_mismatch" | "metadata_mismatch" | "execution_intent_expired" | "invalid_execution_intent_signature" | "execution_intent_payer_mismatch" | "store_conflict" | "policy_denied" | "policy_binding_mismatch" | "simulation_failed" | "gas_cost_exceeded" | "slippage_exceeded" | "execution_uncertain" | "refund_uncertain" | "invalid_state";
        retryable: boolean;
    } | undefined;
    claimToken?: string | undefined;
}>;
type IntentExecutionRecord = IntentExecutionReceipt & {
    intent: HyperEvmExecutionIntent;
};
type IntentStoreConflictKey = "intent_hash" | "quote_id" | "payment_transaction" | "execution_transaction" | "refund_transaction";
type IntentStoreRegistrationResult = {
    kind: "created";
    record: IntentExecutionRecord;
} | {
    kind: "existing";
    record: IntentExecutionRecord;
} | {
    kind: "conflict";
    key: IntentStoreConflictKey;
    record?: IntentExecutionRecord;
};
interface IntentExecutionTransitionPatch {
    claimToken?: string | undefined;
    executionNetwork?: string;
    executionTransaction?: string;
    refundNetwork?: string;
    refundTransaction?: string;
    executionAttempts?: number;
    refundAttempts?: number;
    failure?: IntentExecutionRecord["failure"] | undefined;
    metadata?: Record<string, JsonValue>;
}
interface IntentExecutionTransition {
    intentHash: string;
    expectedRevision: number;
    from: IntentExecutionStatus;
    to: IntentExecutionStatus;
    /** Required when the current record has an active claim token. */
    claimToken?: string;
    patch?: IntentExecutionTransitionPatch;
}
type IntentStoreTransitionResult = {
    kind: "updated";
    record: IntentExecutionRecord;
} | {
    kind: "not_found";
} | {
    kind: "conflict";
    key: IntentStoreConflictKey | "revision" | "status" | "claim_token";
    record: IntentExecutionRecord;
};
/**
 * Durable adapters must implement each method atomically.
 *
 * `registerPaid` requires unique indexes on intent hash,
 * (application, gateway, quote id), and (payment network, payment transaction).
 * `transition` is a compare-and-swap over revision, status, and claim token.
 * Implementations must also enforce unique execution and refund transactions.
 */
interface IntentExecutionStore {
    registerPaid(record: IntentExecutionRecord): Promise<IntentStoreRegistrationResult>;
    get(intentHash: string): Promise<IntentExecutionRecord | undefined>;
    transition(transition: IntentExecutionTransition): Promise<IntentStoreTransitionResult>;
}
/**
 * Single-process development/test store. It is not durable and must not be used
 * as a production replay boundary.
 */
declare class InMemoryIntentExecutionStore implements IntentExecutionStore {
    private readonly records;
    private readonly quotes;
    private readonly payments;
    private readonly executions;
    private readonly refunds;
    registerPaid(input: IntentExecutionRecord): Promise<IntentStoreRegistrationResult>;
    get(intentHash: string): Promise<IntentExecutionRecord | undefined>;
    transition(input: IntentExecutionTransition): Promise<IntentStoreTransitionResult>;
    private transactionConflict;
}
declare function isLegalIntentExecutionTransition(from: IntentExecutionStatus, to: IntentExecutionStatus): boolean;

interface IntentExecutionContext {
    intent: VerifiedPaidExecutionIntent["intent"];
    record: IntentExecutionRecord;
    /** Stable key that execution adapters must use for reconciliation. */
    idempotencyKey: string;
}
type IntentPolicyDecision = {
    allowed: true;
    chainId: number;
    target: Address | string;
    selector: Hex | string;
    callDataHash: Hex | string;
    value: string;
    recipient: Address | string;
    metadata?: Record<string, JsonValue>;
} | {
    allowed: false;
};
type IntentSimulationResult = {
    success: true;
    chainId: number;
    target: Address | string;
    callDataHash: Hex | string;
    value: string;
    recipient: Address | string;
    gasCost: string;
    slippageBps: number;
    metadata?: Record<string, JsonValue>;
} | {
    success: false;
};
type IntentExecutionResult = {
    success: true;
    /** Must mean a confirmed successful destination-chain receipt. */
    confirmed: true;
    transaction: string;
    network: string;
    metadata?: Record<string, JsonValue>;
} | {
    success: false;
    /**
     * True only when the adapter knows no destination transaction succeeded
     * and refunding cannot double-pay the user.
     */
    refundSafe: boolean;
    mayHaveSucceeded?: boolean;
};
interface IntentRefundContext {
    intent: IntentExecutionRecord["intent"];
    record: IntentExecutionRecord;
    /** Stable key that refund adapters must use for reconciliation. */
    idempotencyKey: string;
}
type IntentRefundResult = {
    success: true;
    confirmed: true;
    transaction: string;
    network: string;
    metadata?: Record<string, JsonValue>;
} | {
    success: false;
    retryable: boolean;
    mayHaveSucceeded?: boolean;
};
interface IntentExecutorConfig {
    /** A durable implementation is required in production. */
    store: IntentExecutionStore;
    domain: ExecutionIntentDomain;
    policy: (context: IntentExecutionContext) => Promise<IntentPolicyDecision> | IntentPolicyDecision;
    simulate: (context: IntentExecutionContext, policy: Extract<IntentPolicyDecision, {
        allowed: true;
    }>) => Promise<IntentSimulationResult> | IntentSimulationResult;
    execute: (context: IntentExecutionContext, policy: Extract<IntentPolicyDecision, {
        allowed: true;
    }>, simulation: Extract<IntentSimulationResult, {
        success: true;
    }>) => Promise<IntentExecutionResult>;
    refund: (context: IntentRefundContext) => Promise<IntentRefundResult>;
    /** Intended for deterministic tests; production defaults to random UUIDs. */
    createClaimToken?: () => string;
}
declare class IntentStoreConflictError extends Error {
    readonly record?: IntentExecutionRecord;
    constructor(message: string, record?: IntentExecutionRecord);
}
declare function createIntentExecutor(config: IntentExecutorConfig): {
    store: IntentExecutionStore;
    get(intentHash: string): Promise<IntentExecutionRecord | undefined>;
    verify(input: Omit<PaidIntentVerificationInput, "expectedDomain">): Promise<PaidIntentVerificationResult>;
    execute(input: Omit<PaidIntentVerificationInput, "expectedDomain">): Promise<IntentExecutionRecord>;
    retryRefund(intentHash: string): Promise<IntentExecutionRecord>;
};

export { ExecutionIntentDomain, HyperEvmExecutionIntent, HyperEvmExecutionIntentInput, InMemoryIntentExecutionStore, IntentDeclaration, type IntentExecutionContext, IntentExecutionReceipt, type IntentExecutionRecord, IntentExecutionRecordSchema, type IntentExecutionResult, IntentExecutionStatus, type IntentExecutionStore, type IntentExecutionTransition, type IntentExecutionTransitionPatch, type IntentExecutorConfig, IntentFailureReason, IntentPaymentExtra, type IntentPolicyDecision, type IntentQuoteInput, type IntentRefundContext, type IntentRefundResult, type IntentSimulationResult, IntentStoreConflictError, type IntentStoreConflictKey, type IntentStoreRegistrationResult, type IntentStoreTransitionResult, JsonValue, type PaidIntentVerificationInput, type PaidIntentVerificationResult, type ResolvedIntentQuote, type VerifiedPaidExecutionIntent, assertPaidExecutionIntent, createIntentExecutor, createIntentQuote, isLegalIntentExecutionTransition, verifyPaidExecutionIntent };
