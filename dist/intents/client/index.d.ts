import { ClientExtension } from '@x402/core/client';
import { PaymentRequired, PaymentPayload } from '@x402/core/types';
import { IntentSigner, ExecutionIntentDomain, HyperEvmExecutionIntentInput, IntentDeclaration, HyperEvmExecutionIntent, SignedHyperEvmExecutionIntent } from '../index.js';
export { Bytes32Schema, CanonicalPaymentRequirements, DecimalIntegerStringSchema, EvmAddressSchema, ExecutionIntentDomainSchema, ExecutionIntentPaymentBinding, HexSchema, HyperEvmExecutionIntentSchema, IntentApplicationSchema, IntentBindingFailure, IntentBindingResult, IntentDeclarationOptions, IntentDeclarationSchema, IntentExecutionMode, IntentExecutionModeSchema, IntentExecutionReceipt, IntentExecutionReceiptSchema, IntentExecutionStatus, IntentExecutionStatusSchema, IntentFailure, IntentFailureReason, IntentFailureReasonSchema, IntentFailureSchema, IntentPaymentExtra, IntentPaymentExtraSchema, JsonRecordSchema, JsonValue, JsonValueSchema, NonZeroEvmAddressSchema, SignExecutionIntentOptions, SignedHyperEvmExecutionIntentSchema, TERMINAL_INTENT_EXECUTION_STATUSES, UINT256_MAX, X402_HL_INTENTS_EXTENSION, X402_HL_INTENTS_EXTRA_KEY, X402_HL_INTENT_DOMAIN_NAME, X402_HL_INTENT_DOMAIN_VERSION, X402_HL_INTENT_PRIMARY_TYPE, X402_HL_INTENT_TYPES, X402_HL_INTENT_VERSION, ZERO_ADDRESS, ZERO_BYTES32, attachSignedExecutionIntent, buildExecutionIntentTypedData, canonicalizePaymentRequirements, createIntentDeclaration, createIntentPaymentExtra, getIntentSignerAddress, hashExecutionIntent, hashExecutionIntentTemplate, hashIntentMetadata, hashIntentText, hashPaymentRequirements, isTerminalIntentExecutionStatus, normalizeBytes32, normalizeExecutionIntent, readIntentDeclaration, readIntentPaymentExtra, readSignedExecutionIntent, recoverExecutionIntentSigner, signExecutionIntent, stableJson, verifyExecutionIntentSignature, verifyIntentPaymentExtra } from '../index.js';
import 'zod';
import 'viem';

type IntentResolver = (declaration: IntentDeclaration | undefined, paymentRequired: PaymentRequired, selectedPaymentRequirements: PaymentPayload["accepted"]) => Promise<HyperEvmExecutionIntentInput> | HyperEvmExecutionIntentInput;
type IntentApproval = (intent: HyperEvmExecutionIntent, declaration: IntentDeclaration, paymentRequired: PaymentRequired, selectedPaymentRequirements: PaymentPayload["accepted"]) => Promise<boolean> | boolean;
interface ExecutionIntentClientExtensionConfig {
    signer: IntentSigner;
    /** Locally trusted application and gateway identity. */
    domain: ExecutionIntentDomain;
    /**
     * An exact locally constructed intent or resolver. If omitted, `approve`
     * must explicitly approve the server declaration.
     */
    intent?: HyperEvmExecutionIntentInput | IntentResolver;
    approve?: IntentApproval;
}
declare function signDeclaredExecutionIntent(paymentPayload: PaymentPayload, paymentRequired: PaymentRequired, config: ExecutionIntentClientExtensionConfig): Promise<SignedHyperEvmExecutionIntent | undefined>;
declare function createExecutionIntentClientExtension(config: ExecutionIntentClientExtensionConfig): ClientExtension;

export { type ExecutionIntentClientExtensionConfig, ExecutionIntentDomain, HyperEvmExecutionIntent, HyperEvmExecutionIntentInput, type IntentApproval, IntentDeclaration, type IntentResolver, IntentSigner, SignedHyperEvmExecutionIntent, createExecutionIntentClientExtension, signDeclaredExecutionIntent };
