import type { PaymentPayload, PaymentRequired } from "@x402/core/types";
import {
  HyperEvmExecutionIntentInput,
  IntentDeclaration,
  IntentDeclarationSchema,
  SignedHyperEvmExecutionIntent,
  SignedHyperEvmExecutionIntentSchema,
  X402_HL_INTENTS_EXTENSION,
  X402_HL_INTENT_VERSION,
  IntentExecutionMode,
} from "./types";
import { ExecutionIntentTypedDataOptions, hashExecutionIntent, normalizeExecutionIntent } from "./typed-data";

export interface IntentDeclarationOptions extends ExecutionIntentTypedDataOptions {
  required?: boolean;
  mode?: IntentExecutionMode;
  expiresAt?: number;
}

export function createIntentDeclaration(
  input: HyperEvmExecutionIntentInput,
  options: IntentDeclarationOptions = {},
): IntentDeclaration {
  const intent = normalizeExecutionIntent(input);
  return IntentDeclarationSchema.parse({
    version: X402_HL_INTENT_VERSION,
    required: options.required ?? true,
    mode: options.mode ?? "brokered",
    intent,
    intentHash: hashExecutionIntent(intent, options),
    quoteId: intent.quoteId,
    expiresAt: options.expiresAt,
  });
}

export function readIntentDeclaration(paymentRequired: PaymentRequired): IntentDeclaration | undefined {
  const declaration = paymentRequired.extensions?.[X402_HL_INTENTS_EXTENSION];
  if (declaration == null) return undefined;
  return IntentDeclarationSchema.parse(declaration);
}

export function attachSignedExecutionIntent(
  paymentPayload: PaymentPayload,
  signedIntent: SignedHyperEvmExecutionIntent,
): PaymentPayload {
  return {
    ...paymentPayload,
    extensions: {
      ...(paymentPayload.extensions ?? {}),
      [X402_HL_INTENTS_EXTENSION]: SignedHyperEvmExecutionIntentSchema.parse(signedIntent),
    },
  };
}

export function readSignedExecutionIntent(
  paymentPayload: PaymentPayload,
): SignedHyperEvmExecutionIntent | undefined {
  const signedIntent = paymentPayload.extensions?.[X402_HL_INTENTS_EXTENSION];
  if (signedIntent == null) return undefined;
  return SignedHyperEvmExecutionIntentSchema.parse(signedIntent);
}
