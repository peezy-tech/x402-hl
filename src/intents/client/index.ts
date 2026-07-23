import type { ClientExtension } from "@x402/core/client";
import type { PaymentPayload, PaymentRequired } from "@x402/core/types";
import { getAddress } from "viem";
import {
  ExecutionIntentDomain,
  ExecutionIntentDomainSchema,
  HyperEvmExecutionIntent,
  HyperEvmExecutionIntentInput,
  IntentDeclaration,
  SignedHyperEvmExecutionIntent,
  X402_HL_INTENTS_EXTENSION,
} from "../types";
import {
  IntentSigner,
  signExecutionIntent,
} from "../signature";
import {
  attachSignedExecutionIntent,
  readIntentDeclaration,
} from "../extension";
import {
  hashPaymentRequirements,
  verifyIntentPaymentExtra,
} from "../payment";
import {
  hashExecutionIntentTemplate,
  normalizeExecutionIntent,
} from "../typed-data";

export * from "../index";

export type IntentResolver = (
  declaration: IntentDeclaration | undefined,
  paymentRequired: PaymentRequired,
  selectedPaymentRequirements: PaymentPayload["accepted"],
) => Promise<HyperEvmExecutionIntentInput> | HyperEvmExecutionIntentInput;

export type IntentApproval = (
  intent: HyperEvmExecutionIntent,
  declaration: IntentDeclaration,
  paymentRequired: PaymentRequired,
  selectedPaymentRequirements: PaymentPayload["accepted"],
) => Promise<boolean> | boolean;

export interface ExecutionIntentClientExtensionConfig {
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

export async function signDeclaredExecutionIntent(
  paymentPayload: PaymentPayload,
  paymentRequired: PaymentRequired,
  config: ExecutionIntentClientExtensionConfig,
): Promise<SignedHyperEvmExecutionIntent | undefined> {
  const declaration = readIntentDeclaration(paymentRequired);
  if (!declaration) return undefined;

  const selected = paymentPayload.accepted;
  const selectedHash = hashPaymentRequirements(selected);
  const advertised = paymentRequired.accepts.some(
    requirements =>
      hashPaymentRequirements(requirements).toLowerCase() ===
      selectedHash.toLowerCase(),
  );
  if (!advertised) {
    throw new Error("Selected payment requirements were not advertised by the server");
  }

  const input = await resolveIntentInput(
    declaration,
    paymentRequired,
    selected,
    config,
  );
  const intent = normalizeExecutionIntent(input);
  assertExpectedDomain(intent, config.domain);

  if (
    hashExecutionIntentTemplate(intent).toLowerCase() !==
    declaration.intentTemplateHash.toLowerCase()
  ) {
    throw new Error("Resolved execution intent does not match the server declaration");
  }

  const binding = verifyIntentPaymentExtra(intent, selected);
  if (!binding.ok) {
    throw new Error(`${binding.reason}: ${binding.message}`);
  }

  return signExecutionIntent(intent, config.signer, {
    paymentRequirements: selected,
  });
}

export function createExecutionIntentClientExtension(
  config: ExecutionIntentClientExtensionConfig,
): ClientExtension {
  ExecutionIntentDomainSchema.parse(config.domain);
  if (!config.intent && !config.approve) {
    throw new Error(
      "Execution intent clients require an exact intent/resolver or an explicit approval callback",
    );
  }

  return {
    key: X402_HL_INTENTS_EXTENSION,
    async enrichPaymentPayload(
      paymentPayload: PaymentPayload,
      paymentRequired: PaymentRequired,
    ): Promise<PaymentPayload> {
      const signedIntent = await signDeclaredExecutionIntent(
        paymentPayload,
        paymentRequired,
        config,
      );
      if (!signedIntent) return paymentPayload;
      return attachSignedExecutionIntent(paymentPayload, signedIntent);
    },
  };
}

async function resolveIntentInput(
  declaration: IntentDeclaration,
  paymentRequired: PaymentRequired,
  selected: PaymentPayload["accepted"],
  config: ExecutionIntentClientExtensionConfig,
): Promise<HyperEvmExecutionIntentInput> {
  const configuredIntent = config.intent;
  if (typeof configuredIntent === "function") {
    return configuredIntent(declaration, paymentRequired, selected);
  }
  if (configuredIntent) return configuredIntent;

  const approved = await config.approve?.(
    declaration.intent,
    declaration,
    paymentRequired,
    selected,
  );
  if (!approved) {
    throw new Error("Execution intent declaration was not approved by the client");
  }
  return declaration.intent;
}

function assertExpectedDomain(
  intent: HyperEvmExecutionIntent,
  expected: ExecutionIntentDomain,
): void {
  const parsed = ExecutionIntentDomainSchema.parse(expected);
  if (intent.application !== parsed.application) {
    throw new Error("Execution intent application does not match client configuration");
  }
  if (getAddress(intent.gateway) !== getAddress(parsed.gateway)) {
    throw new Error("Execution intent gateway does not match client configuration");
  }
}
