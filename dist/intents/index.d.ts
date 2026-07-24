import { z } from 'zod';
import { Hex, Address } from 'viem';
import { PaymentRequirements, PaymentPayload, PaymentRequired } from '@x402/core/types';

declare const X402_HL_INTENTS_EXTENSION = "x402-hl/intents";
declare const X402_HL_INTENTS_EXTRA_KEY = "x402HlIntent";
/**
 * Version 2 is the first production-oriented intent format. Version 1 was an
 * unpublished draft and did not bind an application, gateway, or exact payment
 * requirements.
 */
declare const X402_HL_INTENT_VERSION = 2;
declare const X402_HL_INTENT_DOMAIN_NAME = "x402-hl Execution Intent";
declare const X402_HL_INTENT_DOMAIN_VERSION = "2";
declare const ZERO_ADDRESS: "0x0000000000000000000000000000000000000000";
declare const ZERO_BYTES32: "0x0000000000000000000000000000000000000000000000000000000000000000";
declare function isWellFormedUnicode(value: string): boolean;
declare const HexSchema: z.ZodString;
declare const Bytes32Schema: z.ZodString;
declare const EvmAddressSchema: z.ZodString;
declare const NonZeroEvmAddressSchema: z.ZodEffects<z.ZodString, string, string>;
/**
 * Every decimal-integer field is committed as a uint256 in the EIP-712
 * message, so values beyond uint256 must fail schema validation here rather
 * than surface later as a viem IntegerOutOfRangeError during hashing. The
 * length cap bounds validation work; 2^256 - 1 has 78 decimal digits.
 */
declare const UINT256_MAX: bigint;
declare const DecimalIntegerStringSchema: z.ZodEffects<z.ZodString, string, string>;
declare const IntentApplicationSchema: z.ZodString;
declare const PositiveSafeIntegerSchema: z.ZodNumber;
type JsonValue = null | boolean | number | string | JsonValue[] | {
    [key: string]: JsonValue;
};
declare const MAX_JSON_NESTING_DEPTH = 64;
declare const JsonValueSchema: z.ZodType<JsonValue, z.ZodTypeDef, JsonValue>;
declare const JsonRecordSchema: z.ZodRecord<z.ZodString, z.ZodType<JsonValue, z.ZodTypeDef, JsonValue>>;
/** The only execution mode implemented by the TypeScript executor. */
declare const IntentExecutionModeSchema: z.ZodLiteral<"brokered">;
type IntentExecutionMode = z.infer<typeof IntentExecutionModeSchema>;
/**
 * A deployment identity that both clients and servers must configure locally.
 * `gateway` is also used as the EIP-712 verifying contract value.
 */
declare const ExecutionIntentDomainSchema: z.ZodObject<{
    application: z.ZodString;
    gateway: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    application: string;
    gateway: string;
}, {
    application: string;
    gateway: string;
}>;
type ExecutionIntentDomain = z.infer<typeof ExecutionIntentDomainSchema>;
declare const HyperEvmExecutionIntentSchema: z.ZodObject<{
    version: z.ZodLiteral<2>;
    application: z.ZodString;
    gateway: z.ZodEffects<z.ZodString, string, string>;
    user: z.ZodString;
    chainId: z.ZodNumber;
    target: z.ZodString;
    callData: z.ZodString;
    value: z.ZodEffects<z.ZodString, string, string>;
    recipient: z.ZodEffects<z.ZodString, string, string>;
    refundAddress: z.ZodEffects<z.ZodString, string, string>;
    maxGasCost: z.ZodEffects<z.ZodString, string, string>;
    maxSlippageBps: z.ZodNumber;
    deadline: z.ZodNumber;
    nonce: z.ZodEffects<z.ZodString, string, string>;
    quoteId: z.ZodEffects<z.ZodString, string, string>;
    metadataHash: z.ZodString;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<JsonValue, z.ZodTypeDef, JsonValue>>>;
}, "strict", z.ZodTypeAny, {
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
type HyperEvmExecutionIntent = z.infer<typeof HyperEvmExecutionIntentSchema>;
type HyperEvmExecutionIntentInput = Omit<HyperEvmExecutionIntent, "version" | "callData" | "value" | "recipient" | "refundAddress" | "maxGasCost" | "maxSlippageBps" | "quoteId" | "metadataHash"> & Partial<Pick<HyperEvmExecutionIntent, "version" | "callData" | "value" | "recipient" | "refundAddress" | "maxGasCost" | "maxSlippageBps" | "quoteId" | "metadataHash">>;
declare const SignedHyperEvmExecutionIntentSchema: z.ZodObject<{
    intent: z.ZodObject<{
        version: z.ZodLiteral<2>;
        application: z.ZodString;
        gateway: z.ZodEffects<z.ZodString, string, string>;
        user: z.ZodString;
        chainId: z.ZodNumber;
        target: z.ZodString;
        callData: z.ZodString;
        value: z.ZodEffects<z.ZodString, string, string>;
        recipient: z.ZodEffects<z.ZodString, string, string>;
        refundAddress: z.ZodEffects<z.ZodString, string, string>;
        maxGasCost: z.ZodEffects<z.ZodString, string, string>;
        maxSlippageBps: z.ZodNumber;
        deadline: z.ZodNumber;
        nonce: z.ZodEffects<z.ZodString, string, string>;
        quoteId: z.ZodEffects<z.ZodString, string, string>;
        metadataHash: z.ZodString;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<JsonValue, z.ZodTypeDef, JsonValue>>>;
    }, "strict", z.ZodTypeAny, {
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
    paymentRequirementsHash: z.ZodString;
    intentHash: z.ZodString;
    signature: z.ZodString;
    signer: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
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
    signature: string;
    signer?: string | undefined;
}, {
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
    signature: string;
    signer?: string | undefined;
}>;
type SignedHyperEvmExecutionIntent = z.infer<typeof SignedHyperEvmExecutionIntentSchema>;
declare const IntentDeclarationSchema: z.ZodObject<{
    version: z.ZodLiteral<2>;
    required: z.ZodBoolean;
    mode: z.ZodLiteral<"brokered">;
    intent: z.ZodObject<{
        version: z.ZodLiteral<2>;
        application: z.ZodString;
        gateway: z.ZodEffects<z.ZodString, string, string>;
        user: z.ZodString;
        chainId: z.ZodNumber;
        target: z.ZodString;
        callData: z.ZodString;
        value: z.ZodEffects<z.ZodString, string, string>;
        recipient: z.ZodEffects<z.ZodString, string, string>;
        refundAddress: z.ZodEffects<z.ZodString, string, string>;
        maxGasCost: z.ZodEffects<z.ZodString, string, string>;
        maxSlippageBps: z.ZodNumber;
        deadline: z.ZodNumber;
        nonce: z.ZodEffects<z.ZodString, string, string>;
        quoteId: z.ZodEffects<z.ZodString, string, string>;
        metadataHash: z.ZodString;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<JsonValue, z.ZodTypeDef, JsonValue>>>;
    }, "strict", z.ZodTypeAny, {
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
    intentTemplateHash: z.ZodString;
    quoteId: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
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
    required: boolean;
    mode: "brokered";
    intentTemplateHash: string;
}, {
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
    required: boolean;
    mode: "brokered";
    intentTemplateHash: string;
}>;
type IntentDeclaration = z.infer<typeof IntentDeclarationSchema>;
/**
 * Public payment-requirement commitment. It deliberately contains the intent
 * template hash rather than the final signed intent hash, avoiding a circular
 * dependency while still letting the signature commit to the entire finalized
 * `PaymentRequirements` object.
 */
declare const IntentPaymentExtraSchema: z.ZodObject<{
    version: z.ZodLiteral<2>;
    mode: z.ZodLiteral<"brokered">;
    intentTemplateHash: z.ZodString;
    quoteId: z.ZodEffects<z.ZodString, string, string>;
    applicationHash: z.ZodString;
    gateway: z.ZodString;
    chainId: z.ZodNumber;
    target: z.ZodString;
    callDataHash: z.ZodString;
    value: z.ZodEffects<z.ZodString, string, string>;
    recipient: z.ZodString;
    refundAddress: z.ZodString;
    maxGasCost: z.ZodEffects<z.ZodString, string, string>;
    maxSlippageBps: z.ZodNumber;
    deadline: z.ZodNumber;
    nonceHash: z.ZodString;
    metadataHash: z.ZodString;
}, "strip", z.ZodTypeAny, {
    value: string;
    gateway: string;
    version: 2;
    chainId: number;
    target: string;
    recipient: string;
    refundAddress: string;
    maxGasCost: string;
    maxSlippageBps: number;
    deadline: number;
    quoteId: string;
    metadataHash: string;
    mode: "brokered";
    intentTemplateHash: string;
    applicationHash: string;
    callDataHash: string;
    nonceHash: string;
}, {
    value: string;
    gateway: string;
    version: 2;
    chainId: number;
    target: string;
    recipient: string;
    refundAddress: string;
    maxGasCost: string;
    maxSlippageBps: number;
    deadline: number;
    quoteId: string;
    metadataHash: string;
    mode: "brokered";
    intentTemplateHash: string;
    applicationHash: string;
    callDataHash: string;
    nonceHash: string;
}>;
type IntentPaymentExtra = z.infer<typeof IntentPaymentExtraSchema>;
declare const IntentExecutionStatusSchema: z.ZodEnum<["paid", "execution_claimed", "execution_submitted", "executed", "execution_failed", "refund_pending", "refund_claimed", "refund_submitted", "refunded", "refund_failed", "manual_intervention"]>;
type IntentExecutionStatus = z.infer<typeof IntentExecutionStatusSchema>;
declare const IntentFailureReasonSchema: z.ZodEnum<["malformed_extension_payload", "missing_execution_intent", "missing_intent_requirement", "missing_settlement", "unsuccessful_settlement", "missing_settled_payer", "missing_settlement_transaction", "settlement_network_mismatch", "settlement_amount_mismatch", "payment_payload_requirements_mismatch", "payment_requirements_hash_mismatch", "intent_template_hash_mismatch", "intent_hash_mismatch", "quote_mismatch", "application_mismatch", "gateway_mismatch", "chain_mismatch", "target_mismatch", "calldata_mismatch", "value_mismatch", "recipient_mismatch", "refund_address_mismatch", "gas_limit_mismatch", "slippage_limit_mismatch", "deadline_mismatch", "nonce_mismatch", "metadata_mismatch", "execution_intent_expired", "invalid_execution_intent_signature", "execution_intent_payer_mismatch", "duplicate_payment", "store_conflict", "policy_denied", "policy_binding_mismatch", "simulation_failed", "gas_cost_exceeded", "slippage_exceeded", "execution_failed", "execution_uncertain", "refund_failed", "refund_uncertain", "invalid_state"]>;
type IntentFailureReason = z.infer<typeof IntentFailureReasonSchema>;
declare const IntentFailureSchema: z.ZodObject<{
    reason: z.ZodEnum<["malformed_extension_payload", "missing_execution_intent", "missing_intent_requirement", "missing_settlement", "unsuccessful_settlement", "missing_settled_payer", "missing_settlement_transaction", "settlement_network_mismatch", "settlement_amount_mismatch", "payment_payload_requirements_mismatch", "payment_requirements_hash_mismatch", "intent_template_hash_mismatch", "intent_hash_mismatch", "quote_mismatch", "application_mismatch", "gateway_mismatch", "chain_mismatch", "target_mismatch", "calldata_mismatch", "value_mismatch", "recipient_mismatch", "refund_address_mismatch", "gas_limit_mismatch", "slippage_limit_mismatch", "deadline_mismatch", "nonce_mismatch", "metadata_mismatch", "execution_intent_expired", "invalid_execution_intent_signature", "execution_intent_payer_mismatch", "duplicate_payment", "store_conflict", "policy_denied", "policy_binding_mismatch", "simulation_failed", "gas_cost_exceeded", "slippage_exceeded", "execution_failed", "execution_uncertain", "refund_failed", "refund_uncertain", "invalid_state"]>;
    message: z.ZodString;
    retryable: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    message: string;
    reason: "execution_failed" | "refund_failed" | "malformed_extension_payload" | "missing_execution_intent" | "missing_intent_requirement" | "missing_settlement" | "unsuccessful_settlement" | "missing_settled_payer" | "missing_settlement_transaction" | "settlement_network_mismatch" | "settlement_amount_mismatch" | "payment_payload_requirements_mismatch" | "payment_requirements_hash_mismatch" | "intent_template_hash_mismatch" | "intent_hash_mismatch" | "quote_mismatch" | "application_mismatch" | "gateway_mismatch" | "chain_mismatch" | "target_mismatch" | "calldata_mismatch" | "value_mismatch" | "recipient_mismatch" | "refund_address_mismatch" | "gas_limit_mismatch" | "slippage_limit_mismatch" | "deadline_mismatch" | "nonce_mismatch" | "metadata_mismatch" | "execution_intent_expired" | "invalid_execution_intent_signature" | "execution_intent_payer_mismatch" | "duplicate_payment" | "store_conflict" | "policy_denied" | "policy_binding_mismatch" | "simulation_failed" | "gas_cost_exceeded" | "slippage_exceeded" | "execution_uncertain" | "refund_uncertain" | "invalid_state";
    retryable: boolean;
}, {
    message: string;
    reason: "execution_failed" | "refund_failed" | "malformed_extension_payload" | "missing_execution_intent" | "missing_intent_requirement" | "missing_settlement" | "unsuccessful_settlement" | "missing_settled_payer" | "missing_settlement_transaction" | "settlement_network_mismatch" | "settlement_amount_mismatch" | "payment_payload_requirements_mismatch" | "payment_requirements_hash_mismatch" | "intent_template_hash_mismatch" | "intent_hash_mismatch" | "quote_mismatch" | "application_mismatch" | "gateway_mismatch" | "chain_mismatch" | "target_mismatch" | "calldata_mismatch" | "value_mismatch" | "recipient_mismatch" | "refund_address_mismatch" | "gas_limit_mismatch" | "slippage_limit_mismatch" | "deadline_mismatch" | "nonce_mismatch" | "metadata_mismatch" | "execution_intent_expired" | "invalid_execution_intent_signature" | "execution_intent_payer_mismatch" | "duplicate_payment" | "store_conflict" | "policy_denied" | "policy_binding_mismatch" | "simulation_failed" | "gas_cost_exceeded" | "slippage_exceeded" | "execution_uncertain" | "refund_uncertain" | "invalid_state";
    retryable: boolean;
}>;
type IntentFailure = z.infer<typeof IntentFailureSchema>;
declare const IntentExecutionReceiptSchema: z.ZodObject<{
    version: z.ZodLiteral<2>;
    revision: z.ZodNumber;
    status: z.ZodEnum<["paid", "execution_claimed", "execution_submitted", "executed", "execution_failed", "refund_pending", "refund_claimed", "refund_submitted", "refunded", "refund_failed", "manual_intervention"]>;
    intentHash: z.ZodString;
    intentTemplateHash: z.ZodString;
    paymentRequirementsHash: z.ZodString;
    quoteId: z.ZodEffects<z.ZodString, string, string>;
    application: z.ZodString;
    gateway: z.ZodString;
    payer: z.ZodString;
    paymentScheme: z.ZodString;
    paymentNetwork: z.ZodString;
    paymentAsset: z.ZodString;
    paymentAmount: z.ZodString;
    paymentPayTo: z.ZodString;
    paymentTransaction: z.ZodString;
    duplicatePayment: z.ZodOptional<z.ZodLiteral<true>>;
    executionNetwork: z.ZodOptional<z.ZodString>;
    executionTransaction: z.ZodOptional<z.ZodString>;
    refundNetwork: z.ZodOptional<z.ZodString>;
    refundTransaction: z.ZodOptional<z.ZodString>;
    executionAttempts: z.ZodNumber;
    refundAttempts: z.ZodNumber;
    failure: z.ZodOptional<z.ZodObject<{
        reason: z.ZodEnum<["malformed_extension_payload", "missing_execution_intent", "missing_intent_requirement", "missing_settlement", "unsuccessful_settlement", "missing_settled_payer", "missing_settlement_transaction", "settlement_network_mismatch", "settlement_amount_mismatch", "payment_payload_requirements_mismatch", "payment_requirements_hash_mismatch", "intent_template_hash_mismatch", "intent_hash_mismatch", "quote_mismatch", "application_mismatch", "gateway_mismatch", "chain_mismatch", "target_mismatch", "calldata_mismatch", "value_mismatch", "recipient_mismatch", "refund_address_mismatch", "gas_limit_mismatch", "slippage_limit_mismatch", "deadline_mismatch", "nonce_mismatch", "metadata_mismatch", "execution_intent_expired", "invalid_execution_intent_signature", "execution_intent_payer_mismatch", "duplicate_payment", "store_conflict", "policy_denied", "policy_binding_mismatch", "simulation_failed", "gas_cost_exceeded", "slippage_exceeded", "execution_failed", "execution_uncertain", "refund_failed", "refund_uncertain", "invalid_state"]>;
        message: z.ZodString;
        retryable: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        message: string;
        reason: "execution_failed" | "refund_failed" | "malformed_extension_payload" | "missing_execution_intent" | "missing_intent_requirement" | "missing_settlement" | "unsuccessful_settlement" | "missing_settled_payer" | "missing_settlement_transaction" | "settlement_network_mismatch" | "settlement_amount_mismatch" | "payment_payload_requirements_mismatch" | "payment_requirements_hash_mismatch" | "intent_template_hash_mismatch" | "intent_hash_mismatch" | "quote_mismatch" | "application_mismatch" | "gateway_mismatch" | "chain_mismatch" | "target_mismatch" | "calldata_mismatch" | "value_mismatch" | "recipient_mismatch" | "refund_address_mismatch" | "gas_limit_mismatch" | "slippage_limit_mismatch" | "deadline_mismatch" | "nonce_mismatch" | "metadata_mismatch" | "execution_intent_expired" | "invalid_execution_intent_signature" | "execution_intent_payer_mismatch" | "duplicate_payment" | "store_conflict" | "policy_denied" | "policy_binding_mismatch" | "simulation_failed" | "gas_cost_exceeded" | "slippage_exceeded" | "execution_uncertain" | "refund_uncertain" | "invalid_state";
        retryable: boolean;
    }, {
        message: string;
        reason: "execution_failed" | "refund_failed" | "malformed_extension_payload" | "missing_execution_intent" | "missing_intent_requirement" | "missing_settlement" | "unsuccessful_settlement" | "missing_settled_payer" | "missing_settlement_transaction" | "settlement_network_mismatch" | "settlement_amount_mismatch" | "payment_payload_requirements_mismatch" | "payment_requirements_hash_mismatch" | "intent_template_hash_mismatch" | "intent_hash_mismatch" | "quote_mismatch" | "application_mismatch" | "gateway_mismatch" | "chain_mismatch" | "target_mismatch" | "calldata_mismatch" | "value_mismatch" | "recipient_mismatch" | "refund_address_mismatch" | "gas_limit_mismatch" | "slippage_limit_mismatch" | "deadline_mismatch" | "nonce_mismatch" | "metadata_mismatch" | "execution_intent_expired" | "invalid_execution_intent_signature" | "execution_intent_payer_mismatch" | "duplicate_payment" | "store_conflict" | "policy_denied" | "policy_binding_mismatch" | "simulation_failed" | "gas_cost_exceeded" | "slippage_exceeded" | "execution_uncertain" | "refund_uncertain" | "invalid_state";
        retryable: boolean;
    }>>;
    claimToken: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<JsonValue, z.ZodTypeDef, JsonValue>>>;
}, "strip", z.ZodTypeAny, {
    status: "paid" | "execution_claimed" | "execution_submitted" | "executed" | "execution_failed" | "refund_pending" | "refund_claimed" | "refund_submitted" | "refunded" | "refund_failed" | "manual_intervention";
    application: string;
    gateway: string;
    version: 2;
    quoteId: string;
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
    duplicatePayment?: true | undefined;
    executionNetwork?: string | undefined;
    executionTransaction?: string | undefined;
    refundNetwork?: string | undefined;
    refundTransaction?: string | undefined;
    failure?: {
        message: string;
        reason: "execution_failed" | "refund_failed" | "malformed_extension_payload" | "missing_execution_intent" | "missing_intent_requirement" | "missing_settlement" | "unsuccessful_settlement" | "missing_settled_payer" | "missing_settlement_transaction" | "settlement_network_mismatch" | "settlement_amount_mismatch" | "payment_payload_requirements_mismatch" | "payment_requirements_hash_mismatch" | "intent_template_hash_mismatch" | "intent_hash_mismatch" | "quote_mismatch" | "application_mismatch" | "gateway_mismatch" | "chain_mismatch" | "target_mismatch" | "calldata_mismatch" | "value_mismatch" | "recipient_mismatch" | "refund_address_mismatch" | "gas_limit_mismatch" | "slippage_limit_mismatch" | "deadline_mismatch" | "nonce_mismatch" | "metadata_mismatch" | "execution_intent_expired" | "invalid_execution_intent_signature" | "execution_intent_payer_mismatch" | "duplicate_payment" | "store_conflict" | "policy_denied" | "policy_binding_mismatch" | "simulation_failed" | "gas_cost_exceeded" | "slippage_exceeded" | "execution_uncertain" | "refund_uncertain" | "invalid_state";
        retryable: boolean;
    } | undefined;
    claimToken?: string | undefined;
}, {
    status: "paid" | "execution_claimed" | "execution_submitted" | "executed" | "execution_failed" | "refund_pending" | "refund_claimed" | "refund_submitted" | "refunded" | "refund_failed" | "manual_intervention";
    application: string;
    gateway: string;
    version: 2;
    quoteId: string;
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
    duplicatePayment?: true | undefined;
    executionNetwork?: string | undefined;
    executionTransaction?: string | undefined;
    refundNetwork?: string | undefined;
    refundTransaction?: string | undefined;
    failure?: {
        message: string;
        reason: "execution_failed" | "refund_failed" | "malformed_extension_payload" | "missing_execution_intent" | "missing_intent_requirement" | "missing_settlement" | "unsuccessful_settlement" | "missing_settled_payer" | "missing_settlement_transaction" | "settlement_network_mismatch" | "settlement_amount_mismatch" | "payment_payload_requirements_mismatch" | "payment_requirements_hash_mismatch" | "intent_template_hash_mismatch" | "intent_hash_mismatch" | "quote_mismatch" | "application_mismatch" | "gateway_mismatch" | "chain_mismatch" | "target_mismatch" | "calldata_mismatch" | "value_mismatch" | "recipient_mismatch" | "refund_address_mismatch" | "gas_limit_mismatch" | "slippage_limit_mismatch" | "deadline_mismatch" | "nonce_mismatch" | "metadata_mismatch" | "execution_intent_expired" | "invalid_execution_intent_signature" | "execution_intent_payer_mismatch" | "duplicate_payment" | "store_conflict" | "policy_denied" | "policy_binding_mismatch" | "simulation_failed" | "gas_cost_exceeded" | "slippage_exceeded" | "execution_uncertain" | "refund_uncertain" | "invalid_state";
        retryable: boolean;
    } | undefined;
    claimToken?: string | undefined;
}>;
type IntentExecutionReceipt = z.infer<typeof IntentExecutionReceiptSchema>;
declare const TERMINAL_INTENT_EXECUTION_STATUSES: readonly IntentExecutionStatus[];
declare function isTerminalIntentExecutionStatus(status: IntentExecutionStatus): boolean;

/**
 * Return a deterministic JSON encoding.
 *
 * Unlike `JSON.stringify`, this function rejects values that do not have a
 * portable JSON representation. That keeps metadata commitments identical
 * across runtimes and prevents an `undefined`, `BigInt`, class instance, or
 * cyclic value from being signed differently than it is displayed.
 */
declare function stableJson(value: unknown): string;

declare const X402_HL_INTENT_PRIMARY_TYPE = "X402HyperEvmIntent";
declare const X402_HL_INTENT_TYPES: {
    readonly X402HyperEvmIntent: readonly [{
        readonly name: "version";
        readonly type: "uint16";
    }, {
        readonly name: "applicationHash";
        readonly type: "bytes32";
    }, {
        readonly name: "gateway";
        readonly type: "address";
    }, {
        readonly name: "user";
        readonly type: "address";
    }, {
        readonly name: "chainId";
        readonly type: "uint256";
    }, {
        readonly name: "target";
        readonly type: "address";
    }, {
        readonly name: "value";
        readonly type: "uint256";
    }, {
        readonly name: "callDataHash";
        readonly type: "bytes32";
    }, {
        readonly name: "recipient";
        readonly type: "address";
    }, {
        readonly name: "refundAddress";
        readonly type: "address";
    }, {
        readonly name: "maxGasCost";
        readonly type: "uint256";
    }, {
        readonly name: "maxSlippageBps";
        readonly type: "uint16";
    }, {
        readonly name: "deadline";
        readonly type: "uint256";
    }, {
        readonly name: "nonce";
        readonly type: "bytes32";
    }, {
        readonly name: "quoteId";
        readonly type: "bytes32";
    }, {
        readonly name: "metadataHash";
        readonly type: "bytes32";
    }, {
        readonly name: "paymentRequirementsHash";
        readonly type: "bytes32";
    }];
};
interface ExecutionIntentPaymentBinding {
    paymentRequirementsHash: Hex | string;
}
declare function normalizeExecutionIntent(input: HyperEvmExecutionIntentInput): HyperEvmExecutionIntent;
declare function hashIntentMetadata(metadata: unknown): Hex;
/**
 * Text commitments always hash the UTF-8 bytes of the value. `toBytes` would
 * hex-decode a `0x`-prefixed value instead, letting two distinct text values
 * (for example the nonce `"A"` and the nonce `"0x41"`) collide in the signed
 * typed data.
 */
declare function hashIntentText(value: string): Hex;
declare function normalizeBytes32(value: string | undefined): Hex;
/**
 * Construct the fixed version-2 EIP-712 payload.
 *
 * The domain is intentionally not caller-customizable. The gateway address is
 * the verifying-contract domain component, while the application is committed
 * in the message. Deployments must compare both values to local configuration.
 */
declare function buildExecutionIntentTypedData(input: HyperEvmExecutionIntentInput, binding: ExecutionIntentPaymentBinding): {
    readonly domain: {
        readonly name: "x402-hl Execution Intent";
        readonly version: "2";
        readonly chainId: number;
        readonly verifyingContract: Address;
    };
    readonly types: {
        readonly X402HyperEvmIntent: readonly [{
            readonly name: "version";
            readonly type: "uint16";
        }, {
            readonly name: "applicationHash";
            readonly type: "bytes32";
        }, {
            readonly name: "gateway";
            readonly type: "address";
        }, {
            readonly name: "user";
            readonly type: "address";
        }, {
            readonly name: "chainId";
            readonly type: "uint256";
        }, {
            readonly name: "target";
            readonly type: "address";
        }, {
            readonly name: "value";
            readonly type: "uint256";
        }, {
            readonly name: "callDataHash";
            readonly type: "bytes32";
        }, {
            readonly name: "recipient";
            readonly type: "address";
        }, {
            readonly name: "refundAddress";
            readonly type: "address";
        }, {
            readonly name: "maxGasCost";
            readonly type: "uint256";
        }, {
            readonly name: "maxSlippageBps";
            readonly type: "uint16";
        }, {
            readonly name: "deadline";
            readonly type: "uint256";
        }, {
            readonly name: "nonce";
            readonly type: "bytes32";
        }, {
            readonly name: "quoteId";
            readonly type: "bytes32";
        }, {
            readonly name: "metadataHash";
            readonly type: "bytes32";
        }, {
            readonly name: "paymentRequirementsHash";
            readonly type: "bytes32";
        }];
    };
    readonly primaryType: "X402HyperEvmIntent";
    readonly message: {
        readonly version: 2;
        readonly applicationHash: `0x${string}`;
        readonly gateway: Address;
        readonly user: Address;
        readonly chainId: bigint;
        readonly target: Address;
        readonly value: bigint;
        readonly callDataHash: `0x${string}`;
        readonly recipient: Address;
        readonly refundAddress: Address;
        readonly maxGasCost: bigint;
        readonly maxSlippageBps: number;
        readonly deadline: bigint;
        readonly nonce: `0x${string}`;
        readonly quoteId: `0x${string}`;
        readonly metadataHash: Hex;
        readonly paymentRequirementsHash: `0x${string}`;
    };
};
declare function hashExecutionIntent(input: HyperEvmExecutionIntentInput, binding: ExecutionIntentPaymentBinding): Hex;
/**
 * Hash the immutable quote template before finalized payment requirements
 * exist. A zero payment hash is reserved for this purpose and is never valid in
 * a signed payment payload.
 */
declare function hashExecutionIntentTemplate(input: HyperEvmExecutionIntentInput): Hex;

interface CanonicalPaymentRequirements {
    scheme: string;
    network: string;
    asset: string;
    amount: string;
    payTo: string;
    maxTimeoutSeconds: number;
    extra: Record<string, unknown>;
}
interface IntentBindingFailure {
    reason: IntentFailureReason;
    message: string;
}
type IntentBindingResult = {
    ok: true;
    extra: IntentPaymentExtra;
    intentTemplateHash: Hex;
} | ({
    ok: false;
} & IntentBindingFailure);
/**
 * Preserve every finalized payment-requirement field in a deterministic
 * commitment. `extra` is included in full; the v2 intent extra contains only a
 * template hash, so no circular final-intent hash exists.
 */
declare function canonicalizePaymentRequirements(requirements: PaymentRequirements): CanonicalPaymentRequirements;
declare function hashPaymentRequirements(requirements: PaymentRequirements): Hex;
declare function createIntentPaymentExtra(intent: HyperEvmExecutionIntent, intentTemplateHash?: `0x${string}`): IntentPaymentExtra;
declare function readIntentPaymentExtra(requirements: PaymentRequirements): IntentPaymentExtra | undefined;
declare function verifyIntentPaymentExtra(intent: HyperEvmExecutionIntent, requirements: PaymentRequirements): IntentBindingResult;

type IntentSigner = {
    address?: Address | string;
    account?: {
        address?: Address | string;
    } | Address | string;
    signTypedData: (parameters: any) => Promise<Hex | string>;
};
type SignExecutionIntentOptions = {
    paymentRequirements: PaymentRequirements;
    paymentRequirementsHash?: never;
} | {
    paymentRequirements?: never;
    paymentRequirementsHash: Hex | string;
};
declare function getIntentSignerAddress(signer: IntentSigner): Address;
declare function signExecutionIntent(input: HyperEvmExecutionIntentInput, signer: IntentSigner, options: SignExecutionIntentOptions): Promise<SignedHyperEvmExecutionIntent>;
declare function recoverExecutionIntentSigner(signedIntent: SignedHyperEvmExecutionIntent): Promise<Address>;
declare function verifyExecutionIntentSignature(signedIntent: SignedHyperEvmExecutionIntent): Promise<{
    valid: boolean;
    signer: Address;
    intentHash: Hex;
}>;

interface IntentDeclarationOptions {
    required?: boolean;
}
declare function createIntentDeclaration(input: HyperEvmExecutionIntentInput, options?: IntentDeclarationOptions): IntentDeclaration;
declare function readIntentDeclaration(paymentRequired: PaymentRequired): IntentDeclaration | undefined;
declare function attachSignedExecutionIntent(paymentPayload: PaymentPayload, signedIntent: SignedHyperEvmExecutionIntent): PaymentPayload;
declare function readSignedExecutionIntent(paymentPayload: PaymentPayload): SignedHyperEvmExecutionIntent | undefined;

export { Bytes32Schema, type CanonicalPaymentRequirements, DecimalIntegerStringSchema, EvmAddressSchema, type ExecutionIntentDomain, ExecutionIntentDomainSchema, type ExecutionIntentPaymentBinding, HexSchema, type HyperEvmExecutionIntent, type HyperEvmExecutionIntentInput, HyperEvmExecutionIntentSchema, IntentApplicationSchema, type IntentBindingFailure, type IntentBindingResult, type IntentDeclaration, type IntentDeclarationOptions, IntentDeclarationSchema, type IntentExecutionMode, IntentExecutionModeSchema, type IntentExecutionReceipt, IntentExecutionReceiptSchema, type IntentExecutionStatus, IntentExecutionStatusSchema, type IntentFailure, type IntentFailureReason, IntentFailureReasonSchema, IntentFailureSchema, type IntentPaymentExtra, IntentPaymentExtraSchema, type IntentSigner, JsonRecordSchema, type JsonValue, JsonValueSchema, MAX_JSON_NESTING_DEPTH, NonZeroEvmAddressSchema, PositiveSafeIntegerSchema, type SignExecutionIntentOptions, type SignedHyperEvmExecutionIntent, SignedHyperEvmExecutionIntentSchema, TERMINAL_INTENT_EXECUTION_STATUSES, UINT256_MAX, X402_HL_INTENTS_EXTENSION, X402_HL_INTENTS_EXTRA_KEY, X402_HL_INTENT_DOMAIN_NAME, X402_HL_INTENT_DOMAIN_VERSION, X402_HL_INTENT_PRIMARY_TYPE, X402_HL_INTENT_TYPES, X402_HL_INTENT_VERSION, ZERO_ADDRESS, ZERO_BYTES32, attachSignedExecutionIntent, buildExecutionIntentTypedData, canonicalizePaymentRequirements, createIntentDeclaration, createIntentPaymentExtra, getIntentSignerAddress, hashExecutionIntent, hashExecutionIntentTemplate, hashIntentMetadata, hashIntentText, hashPaymentRequirements, isTerminalIntentExecutionStatus, isWellFormedUnicode, normalizeBytes32, normalizeExecutionIntent, readIntentDeclaration, readIntentPaymentExtra, readSignedExecutionIntent, recoverExecutionIntentSigner, signExecutionIntent, stableJson, verifyExecutionIntentSignature, verifyIntentPaymentExtra };
