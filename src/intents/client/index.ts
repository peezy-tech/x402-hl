import type { ClientExtension } from "@x402/core/client";
import type { PaymentPayload, PaymentRequired } from "@x402/core/types";
import {
  HyperEvmExecutionIntentInput,
  IntentDeclaration,
  SignedHyperEvmExecutionIntent,
  X402_HL_INTENTS_EXTENSION,
} from "../types";
import {
  IntentSigner,
  SignExecutionIntentOptions,
  signExecutionIntent,
} from "../signature";
import {
  attachSignedExecutionIntent,
  readIntentDeclaration,
} from "../extension";

export * from "../index";

export type IntentResolver = (
  declaration: IntentDeclaration | undefined,
  paymentRequired: PaymentRequired,
) => Promise<HyperEvmExecutionIntentInput> | HyperEvmExecutionIntentInput;

export interface ExecutionIntentClientExtensionConfig extends SignExecutionIntentOptions {
  signer: IntentSigner;
  intent?: HyperEvmExecutionIntentInput | IntentResolver;
}

export async function signDeclaredExecutionIntent(
  paymentRequired: PaymentRequired,
  config: ExecutionIntentClientExtensionConfig,
): Promise<SignedHyperEvmExecutionIntent | undefined> {
  const declaration = readIntentDeclaration(paymentRequired);
  const input = await resolveIntentInput(declaration, paymentRequired, config.intent);

  if (!input) {
    if (declaration?.required) {
      throw new Error("x402-hl intent declaration requires a signed execution intent");
    }
    return undefined;
  }

  const signedIntent = await signExecutionIntent(input, config.signer, config);
  if (
    declaration &&
    signedIntent.intentHash.toLowerCase() !== declaration.intentHash.toLowerCase()
  ) {
    throw new Error("Signed execution intent does not match the x402-hl intent declaration");
  }

  return signedIntent;
}

export function createExecutionIntentClientExtension(
  config: ExecutionIntentClientExtensionConfig,
): ClientExtension {
  return {
    key: X402_HL_INTENTS_EXTENSION,
    async enrichPaymentPayload(
      paymentPayload: PaymentPayload,
      paymentRequired: PaymentRequired,
    ): Promise<PaymentPayload> {
      const signedIntent = await signDeclaredExecutionIntent(paymentRequired, config);
      if (!signedIntent) return paymentPayload;
      return attachSignedExecutionIntent(paymentPayload, signedIntent);
    },
  };
}

async function resolveIntentInput(
  declaration: IntentDeclaration | undefined,
  paymentRequired: PaymentRequired,
  configuredIntent: ExecutionIntentClientExtensionConfig["intent"],
): Promise<HyperEvmExecutionIntentInput | undefined> {
  if (typeof configuredIntent === "function") {
    return configuredIntent(declaration, paymentRequired);
  }
  if (configuredIntent) return configuredIntent;
  return declaration?.intent;
}
