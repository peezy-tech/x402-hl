import { z } from 'zod';
import { Address, Hex } from 'viem';
import { PaymentPayload, PaymentRequired } from '@x402/core/types';

declare const X402_HL_INTENTS_EXTENSION = "x402-hl/intents";
declare const X402_HL_INTENTS_EXTRA_KEY = "x402HlIntent";
declare const X402_HL_INTENT_VERSION = 1;
declare const X402_HL_INTENT_DOMAIN_NAME = "x402-hl Intents";
declare const X402_HL_INTENT_DOMAIN_VERSION = "1";
declare const ZERO_ADDRESS: "0x0000000000000000000000000000000000000000";
declare const ZERO_BYTES32: "0x0000000000000000000000000000000000000000000000000000000000000000";
declare const HexSchema: z.ZodString;
declare const Bytes32Schema: z.ZodString;
declare const EvmAddressSchema: z.ZodString;
declare const DecimalIntegerStringSchema: z.ZodString;
declare const JsonRecordSchema: z.ZodRecord<z.ZodString, z.ZodUnknown>;
declare const IntentExecutionModeSchema: z.ZodEnum<["brokered", "contract", "smart-account"]>;
type IntentExecutionMode = z.infer<typeof IntentExecutionModeSchema>;
declare const HyperEvmExecutionIntentSchema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    user: z.ZodString;
    chainId: z.ZodNumber;
    target: z.ZodString;
    callData: z.ZodString;
    value: z.ZodString;
    recipient: z.ZodString;
    refundAddress: z.ZodString;
    maxGasCost: z.ZodString;
    maxSlippageBps: z.ZodNumber;
    deadline: z.ZodNumber;
    nonce: z.ZodString;
    quoteId: z.ZodString;
    metadataHash: z.ZodString;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    value: string;
    version: 1;
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
    metadata?: Record<string, unknown> | undefined;
}, {
    value: string;
    version: 1;
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
    metadata?: Record<string, unknown> | undefined;
}>;
type HyperEvmExecutionIntent = z.infer<typeof HyperEvmExecutionIntentSchema>;
type HyperEvmExecutionIntentInput = Omit<HyperEvmExecutionIntent, "version" | "callData" | "value" | "recipient" | "refundAddress" | "maxGasCost" | "maxSlippageBps" | "quoteId" | "metadataHash"> & Partial<Pick<HyperEvmExecutionIntent, "version" | "callData" | "value" | "recipient" | "refundAddress" | "maxGasCost" | "maxSlippageBps" | "quoteId" | "metadataHash">>;
declare const SignedHyperEvmExecutionIntentSchema: z.ZodObject<{
    intent: z.ZodObject<{
        version: z.ZodLiteral<1>;
        user: z.ZodString;
        chainId: z.ZodNumber;
        target: z.ZodString;
        callData: z.ZodString;
        value: z.ZodString;
        recipient: z.ZodString;
        refundAddress: z.ZodString;
        maxGasCost: z.ZodString;
        maxSlippageBps: z.ZodNumber;
        deadline: z.ZodNumber;
        nonce: z.ZodString;
        quoteId: z.ZodString;
        metadataHash: z.ZodString;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        value: string;
        version: 1;
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
        metadata?: Record<string, unknown> | undefined;
    }, {
        value: string;
        version: 1;
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
        metadata?: Record<string, unknown> | undefined;
    }>;
    intentHash: z.ZodString;
    signature: z.ZodString;
    signer: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    intent: {
        value: string;
        version: 1;
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
        metadata?: Record<string, unknown> | undefined;
    };
    intentHash: string;
    signature: string;
    signer?: string | undefined;
}, {
    intent: {
        value: string;
        version: 1;
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
        metadata?: Record<string, unknown> | undefined;
    };
    intentHash: string;
    signature: string;
    signer?: string | undefined;
}>;
type SignedHyperEvmExecutionIntent = z.infer<typeof SignedHyperEvmExecutionIntentSchema>;
declare const IntentDeclarationSchema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    required: z.ZodBoolean;
    mode: z.ZodDefault<z.ZodEnum<["brokered", "contract", "smart-account"]>>;
    intent: z.ZodObject<{
        version: z.ZodLiteral<1>;
        user: z.ZodString;
        chainId: z.ZodNumber;
        target: z.ZodString;
        callData: z.ZodString;
        value: z.ZodString;
        recipient: z.ZodString;
        refundAddress: z.ZodString;
        maxGasCost: z.ZodString;
        maxSlippageBps: z.ZodNumber;
        deadline: z.ZodNumber;
        nonce: z.ZodString;
        quoteId: z.ZodString;
        metadataHash: z.ZodString;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        value: string;
        version: 1;
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
        metadata?: Record<string, unknown> | undefined;
    }, {
        value: string;
        version: 1;
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
        metadata?: Record<string, unknown> | undefined;
    }>;
    intentHash: z.ZodString;
    quoteId: z.ZodString;
    expiresAt: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    version: 1;
    quoteId: string;
    intent: {
        value: string;
        version: 1;
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
        metadata?: Record<string, unknown> | undefined;
    };
    intentHash: string;
    required: boolean;
    mode: "brokered" | "contract" | "smart-account";
    expiresAt?: number | undefined;
}, {
    version: 1;
    quoteId: string;
    intent: {
        value: string;
        version: 1;
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
        metadata?: Record<string, unknown> | undefined;
    };
    intentHash: string;
    required: boolean;
    mode?: "brokered" | "contract" | "smart-account" | undefined;
    expiresAt?: number | undefined;
}>;
type IntentDeclaration = z.infer<typeof IntentDeclarationSchema>;
declare const IntentPaymentExtraSchema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    mode: z.ZodDefault<z.ZodEnum<["brokered", "contract", "smart-account"]>>;
    intentHash: z.ZodString;
    quoteId: z.ZodString;
    chainId: z.ZodNumber;
    target: z.ZodString;
    deadline: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    version: 1;
    chainId: number;
    target: string;
    deadline: number;
    quoteId: string;
    intentHash: string;
    mode: "brokered" | "contract" | "smart-account";
}, {
    version: 1;
    chainId: number;
    target: string;
    deadline: number;
    quoteId: string;
    intentHash: string;
    mode?: "brokered" | "contract" | "smart-account" | undefined;
}>;
type IntentPaymentExtra = z.infer<typeof IntentPaymentExtraSchema>;
declare const IntentExecutionStatusSchema: z.ZodEnum<["quoted", "paid", "executing", "executed", "failed", "refunded"]>;
type IntentExecutionStatus = z.infer<typeof IntentExecutionStatusSchema>;
declare const IntentExecutionReceiptSchema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    status: z.ZodEnum<["quoted", "paid", "executing", "executed", "failed", "refunded"]>;
    intentHash: z.ZodString;
    quoteId: z.ZodString;
    payer: z.ZodOptional<z.ZodString>;
    paymentNetwork: z.ZodOptional<z.ZodString>;
    paymentTransaction: z.ZodOptional<z.ZodString>;
    executionNetwork: z.ZodOptional<z.ZodString>;
    executionTransaction: z.ZodOptional<z.ZodString>;
    errorReason: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    status: "quoted" | "paid" | "executing" | "executed" | "failed" | "refunded";
    version: 1;
    quoteId: string;
    intentHash: string;
    createdAt: string;
    updatedAt: string;
    metadata?: Record<string, unknown> | undefined;
    payer?: string | undefined;
    paymentNetwork?: string | undefined;
    paymentTransaction?: string | undefined;
    executionNetwork?: string | undefined;
    executionTransaction?: string | undefined;
    errorReason?: string | undefined;
}, {
    status: "quoted" | "paid" | "executing" | "executed" | "failed" | "refunded";
    version: 1;
    quoteId: string;
    intentHash: string;
    createdAt: string;
    updatedAt: string;
    metadata?: Record<string, unknown> | undefined;
    payer?: string | undefined;
    paymentNetwork?: string | undefined;
    paymentTransaction?: string | undefined;
    executionNetwork?: string | undefined;
    executionTransaction?: string | undefined;
    errorReason?: string | undefined;
}>;
type IntentExecutionReceipt = z.infer<typeof IntentExecutionReceiptSchema>;

declare function stableJson(value: unknown): string;

declare const X402_HL_INTENT_PRIMARY_TYPE = "X402HyperEvmIntent";
declare const X402_HL_INTENT_TYPES: {
    readonly X402HyperEvmIntent: readonly [{
        readonly name: "user";
        readonly type: "address";
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
    }];
};
interface ExecutionIntentTypedDataOptions {
    domainName?: string;
    domainVersion?: string;
    verifyingContract?: Address;
}
declare function normalizeExecutionIntent(input: HyperEvmExecutionIntentInput): HyperEvmExecutionIntent;
declare function hashIntentMetadata(metadata: unknown): Hex;
declare function hashIntentText(value: string): Hex;
declare function normalizeBytes32(value: string | undefined): Hex;
declare function buildExecutionIntentTypedData(input: HyperEvmExecutionIntentInput, options?: ExecutionIntentTypedDataOptions): {
    readonly domain: {
        name: string;
        version: string;
        chainId: number;
        verifyingContract?: Address;
    };
    readonly types: {
        readonly X402HyperEvmIntent: readonly [{
            readonly name: "user";
            readonly type: "address";
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
        }];
    };
    readonly primaryType: "X402HyperEvmIntent";
    readonly message: {
        readonly user: Address;
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
    };
};
declare function hashExecutionIntent(input: HyperEvmExecutionIntentInput, options?: ExecutionIntentTypedDataOptions): Hex;

type IntentSigner = {
    address?: Address | string;
    account?: {
        address?: Address | string;
    } | Address | string;
    signTypedData: (parameters: any) => Promise<Hex | string>;
};
interface SignExecutionIntentOptions extends ExecutionIntentTypedDataOptions {
}
interface VerifyExecutionIntentOptions extends ExecutionIntentTypedDataOptions {
}
declare function getIntentSignerAddress(signer: IntentSigner): Address;
declare function signExecutionIntent(input: HyperEvmExecutionIntentInput, signer: IntentSigner, options?: SignExecutionIntentOptions): Promise<SignedHyperEvmExecutionIntent>;
declare function recoverExecutionIntentSigner(signedIntent: SignedHyperEvmExecutionIntent, options?: VerifyExecutionIntentOptions): Promise<Address>;
declare function verifyExecutionIntentSignature(signedIntent: SignedHyperEvmExecutionIntent, options?: VerifyExecutionIntentOptions): Promise<{
    valid: boolean;
    signer: Address;
    intentHash: Hex;
}>;

interface IntentDeclarationOptions extends ExecutionIntentTypedDataOptions {
    required?: boolean;
    mode?: IntentExecutionMode;
    expiresAt?: number;
}
declare function createIntentDeclaration(input: HyperEvmExecutionIntentInput, options?: IntentDeclarationOptions): IntentDeclaration;
declare function readIntentDeclaration(paymentRequired: PaymentRequired): IntentDeclaration | undefined;
declare function attachSignedExecutionIntent(paymentPayload: PaymentPayload, signedIntent: SignedHyperEvmExecutionIntent): PaymentPayload;
declare function readSignedExecutionIntent(paymentPayload: PaymentPayload): SignedHyperEvmExecutionIntent | undefined;

export { Bytes32Schema, DecimalIntegerStringSchema, EvmAddressSchema, type ExecutionIntentTypedDataOptions, HexSchema, type HyperEvmExecutionIntent, type HyperEvmExecutionIntentInput, HyperEvmExecutionIntentSchema, type IntentDeclaration, type IntentDeclarationOptions, IntentDeclarationSchema, type IntentExecutionMode, IntentExecutionModeSchema, type IntentExecutionReceipt, IntentExecutionReceiptSchema, type IntentExecutionStatus, IntentExecutionStatusSchema, type IntentPaymentExtra, IntentPaymentExtraSchema, type IntentSigner, JsonRecordSchema, type SignExecutionIntentOptions, type SignedHyperEvmExecutionIntent, SignedHyperEvmExecutionIntentSchema, type VerifyExecutionIntentOptions, X402_HL_INTENTS_EXTENSION, X402_HL_INTENTS_EXTRA_KEY, X402_HL_INTENT_DOMAIN_NAME, X402_HL_INTENT_DOMAIN_VERSION, X402_HL_INTENT_PRIMARY_TYPE, X402_HL_INTENT_TYPES, X402_HL_INTENT_VERSION, ZERO_ADDRESS, ZERO_BYTES32, attachSignedExecutionIntent, buildExecutionIntentTypedData, createIntentDeclaration, getIntentSignerAddress, hashExecutionIntent, hashIntentMetadata, hashIntentText, normalizeBytes32, normalizeExecutionIntent, readIntentDeclaration, readSignedExecutionIntent, recoverExecutionIntentSigner, signExecutionIntent, stableJson, verifyExecutionIntentSignature };
