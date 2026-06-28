import { ClientExtension } from '@x402/core/client';
import { PaymentRequired } from '@x402/core/types';
import { SignExecutionIntentOptions, IntentSigner, HyperEvmExecutionIntentInput, IntentDeclaration, SignedHyperEvmExecutionIntent } from '../index.js';
export { Bytes32Schema, DecimalIntegerStringSchema, EvmAddressSchema, ExecutionIntentTypedDataOptions, HexSchema, HyperEvmExecutionIntent, HyperEvmExecutionIntentSchema, IntentDeclarationOptions, IntentDeclarationSchema, IntentExecutionMode, IntentExecutionModeSchema, IntentExecutionReceipt, IntentExecutionReceiptSchema, IntentExecutionStatus, IntentExecutionStatusSchema, IntentPaymentExtra, IntentPaymentExtraSchema, JsonRecordSchema, SignedHyperEvmExecutionIntentSchema, VerifyExecutionIntentOptions, X402_HL_INTENTS_EXTENSION, X402_HL_INTENTS_EXTRA_KEY, X402_HL_INTENT_DOMAIN_NAME, X402_HL_INTENT_DOMAIN_VERSION, X402_HL_INTENT_PRIMARY_TYPE, X402_HL_INTENT_TYPES, X402_HL_INTENT_VERSION, ZERO_ADDRESS, ZERO_BYTES32, attachSignedExecutionIntent, buildExecutionIntentTypedData, createIntentDeclaration, getIntentSignerAddress, hashExecutionIntent, hashIntentMetadata, hashIntentText, normalizeBytes32, normalizeExecutionIntent, readIntentDeclaration, readSignedExecutionIntent, recoverExecutionIntentSigner, signExecutionIntent, stableJson, verifyExecutionIntentSignature } from '../index.js';
import 'zod';
import 'viem';

type IntentResolver = (declaration: IntentDeclaration | undefined, paymentRequired: PaymentRequired) => Promise<HyperEvmExecutionIntentInput> | HyperEvmExecutionIntentInput;
interface ExecutionIntentClientExtensionConfig extends SignExecutionIntentOptions {
    signer: IntentSigner;
    intent?: HyperEvmExecutionIntentInput | IntentResolver;
}
declare function signDeclaredExecutionIntent(paymentRequired: PaymentRequired, config: ExecutionIntentClientExtensionConfig): Promise<SignedHyperEvmExecutionIntent | undefined>;
declare function createExecutionIntentClientExtension(config: ExecutionIntentClientExtensionConfig): ClientExtension;

export { type ExecutionIntentClientExtensionConfig, HyperEvmExecutionIntentInput, IntentDeclaration, type IntentResolver, IntentSigner, SignExecutionIntentOptions, SignedHyperEvmExecutionIntent, createExecutionIntentClientExtension, signDeclaredExecutionIntent };
