import type { Price, PaymentPayload, PaymentRequirements, SettleResponse } from "@x402/core/types";
import type { RouteConfig } from "@x402/core/server";
import type { Address, Hex } from "viem";
import {
  HyperEvmExecutionIntent,
  HyperEvmExecutionIntentInput,
  IntentDeclaration,
  IntentExecutionMode,
  IntentExecutionReceipt,
  IntentExecutionStatus,
  IntentPaymentExtra,
  IntentPaymentExtraSchema,
  SignedHyperEvmExecutionIntent,
  X402_HL_INTENTS_EXTENSION,
  X402_HL_INTENTS_EXTRA_KEY,
  X402_HL_INTENT_VERSION,
} from "../types";
import {
  ExecutionIntentTypedDataOptions,
  hashExecutionIntent,
  normalizeExecutionIntent,
} from "../typed-data";
import { createIntentDeclaration, readSignedExecutionIntent } from "../extension";
import { verifyExecutionIntentSignature } from "../signature";

export * from "../index";

export interface IntentQuoteInput extends ExecutionIntentTypedDataOptions {
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

export interface ResolvedIntentQuote {
  id: string;
  intent: HyperEvmExecutionIntent;
  intentHash: Hex;
  declaration: IntentDeclaration;
  paymentExtra: IntentPaymentExtra;
  routeConfig: RouteConfig;
}

export interface PaidIntentVerificationInput extends ExecutionIntentTypedDataOptions {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
  settleResponse?: SettleResponse;
  requireSamePayer?: boolean;
  now?: number;
}

export type PaidIntentVerificationResult =
  | {
      ok: true;
      intent: HyperEvmExecutionIntent;
      signedIntent: SignedHyperEvmExecutionIntent;
      intentHash: Hex;
      signer: Address;
      payer?: string;
      settlement?: SettleResponse;
    }
  | {
      ok: false;
      reason: string;
      message: string;
    };

export interface IntentExecutionContext {
  intent: HyperEvmExecutionIntent;
  signedIntent: SignedHyperEvmExecutionIntent;
  intentHash: Hex;
  signer: Address;
  payer?: string;
  settlement?: SettleResponse;
}

export interface IntentExecutionResult {
  transaction: string;
  network?: string;
  status?: Extract<IntentExecutionStatus, "executed" | "failed">;
  errorReason?: string;
  metadata?: Record<string, unknown>;
}

export interface IntentExecutorConfig {
  store?: IntentExecutionStore;
  execute: (context: IntentExecutionContext) => Promise<IntentExecutionResult>;
  typedData?: ExecutionIntentTypedDataOptions;
}

export interface IntentExecutionRecord extends IntentExecutionReceipt {
  intent?: HyperEvmExecutionIntent;
  signedIntent?: SignedHyperEvmExecutionIntent;
  settlement?: SettleResponse;
}

export interface IntentExecutionStore {
  record(record: IntentExecutionRecord): void;
  get(intentHash: string): IntentExecutionRecord | undefined;
  list(): IntentExecutionRecord[];
}

export function createIntentQuote(input: IntentQuoteInput): ResolvedIntentQuote {
  const intent = normalizeExecutionIntent({
    ...input.intent,
    quoteId: input.intent.quoteId ?? input.id,
  });
  const declaration = createIntentDeclaration(intent, {
    ...input,
    mode: input.mode ?? "brokered",
    expiresAt: input.expiresAt,
  });
  const paymentExtra = IntentPaymentExtraSchema.parse({
    version: X402_HL_INTENT_VERSION,
    mode: input.mode ?? "brokered",
    intentHash: declaration.intentHash,
    quoteId: intent.quoteId,
    chainId: intent.chainId,
    target: intent.target,
    deadline: intent.deadline,
  });

  const routeConfig: RouteConfig = {
    accepts: {
      scheme: "exact",
      network: input.network,
      price: input.price,
      payTo: input.payTo,
      maxTimeoutSeconds: input.maxTimeoutSeconds,
      extra: {
        ...(input.extra ?? {}),
        [X402_HL_INTENTS_EXTRA_KEY]: paymentExtra,
      },
    },
    description: input.description,
    mimeType: input.mimeType ?? "application/json",
    serviceName: input.serviceName,
    tags: input.tags,
    iconUrl: input.iconUrl,
    extensions: {
      [X402_HL_INTENTS_EXTENSION]: declaration,
    },
  };

  return {
    id: input.id,
    intent,
    intentHash: declaration.intentHash as Hex,
    declaration,
    paymentExtra,
    routeConfig,
  };
}

export function getIntentPaymentExtra(
  requirements: PaymentRequirements,
): IntentPaymentExtra | undefined {
  const extra = requirements.extra?.[X402_HL_INTENTS_EXTRA_KEY];
  if (extra == null) return undefined;
  return IntentPaymentExtraSchema.parse(extra);
}

export async function verifyPaidExecutionIntent(
  input: PaidIntentVerificationInput,
): Promise<PaidIntentVerificationResult> {
  const signedIntent = readSignedExecutionIntent(input.paymentPayload);
  if (!signedIntent) {
    return {
      ok: false,
      reason: "missing_execution_intent",
      message: "Payment payload does not include an x402-hl execution intent",
    };
  }

  const paymentExtra = getIntentPaymentExtra(input.paymentRequirements);
  if (!paymentExtra) {
    return {
      ok: false,
      reason: "missing_intent_requirement",
      message: "Payment requirements are not bound to an x402-hl execution intent",
    };
  }

  const now = input.now ?? Math.floor(Date.now() / 1000);
  if (signedIntent.intent.deadline < now) {
    return {
      ok: false,
      reason: "execution_intent_expired",
      message: "Execution intent deadline has passed",
    };
  }

  const expectedHash = hashExecutionIntent(signedIntent.intent, input);
  if (expectedHash.toLowerCase() !== signedIntent.intentHash.toLowerCase()) {
    return {
      ok: false,
      reason: "execution_intent_hash_mismatch",
      message: "Execution intent hash does not match its typed data",
    };
  }

  if (paymentExtra.intentHash.toLowerCase() !== signedIntent.intentHash.toLowerCase()) {
    return {
      ok: false,
      reason: "payment_intent_hash_mismatch",
      message: "Payment requirements are bound to a different execution intent",
    };
  }

  if (paymentExtra.quoteId !== signedIntent.intent.quoteId) {
    return {
      ok: false,
      reason: "payment_intent_quote_mismatch",
      message: "Payment requirements are bound to a different quote id",
    };
  }

  const signature = await verifyExecutionIntentSignature(signedIntent, input);
  if (!signature.valid) {
    return {
      ok: false,
      reason: "invalid_execution_intent_signature",
      message: "Execution intent signature is invalid",
    };
  }

  const payer = input.settleResponse?.payer ?? payerFromPaymentPayload(input.paymentPayload);
  if (
    input.requireSamePayer !== false &&
    payer &&
    payer.toLowerCase() !== signature.signer.toLowerCase()
  ) {
    return {
      ok: false,
      reason: "execution_intent_payer_mismatch",
      message: "Execution intent signer does not match the settled Hyperliquid payer",
    };
  }

  return {
    ok: true,
    intent: signedIntent.intent,
    signedIntent,
    intentHash: signedIntent.intentHash as Hex,
    signer: signature.signer,
    payer,
    settlement: input.settleResponse,
  };
}

export async function assertPaidExecutionIntent(
  input: PaidIntentVerificationInput,
): Promise<Extract<PaidIntentVerificationResult, { ok: true }>> {
  const result = await verifyPaidExecutionIntent(input);
  if (!result.ok) {
    throw new Error(`${result.reason}: ${result.message}`);
  }
  return result;
}

export function createIntentExecutor(config: IntentExecutorConfig) {
  const store = config.store ?? new InMemoryIntentExecutionStore();

  return {
    store,
    async verify(input: PaidIntentVerificationInput): Promise<PaidIntentVerificationResult> {
      return verifyPaidExecutionIntent({
        ...config.typedData,
        ...input,
      });
    },
    async execute(input: PaidIntentVerificationInput): Promise<IntentExecutionRecord> {
      const verified = await assertPaidExecutionIntent({
        ...config.typedData,
        ...input,
      });
      recordPaidIntent(store, verified);
      recordIntentStatus(store, verified, "executing");

      try {
        const execution = await config.execute(verified);
        const status = execution.status ?? "executed";
        const record = recordIntentStatus(store, verified, status, {
          executionNetwork: execution.network,
          executionTransaction: execution.transaction,
          errorReason: execution.errorReason,
          metadata: execution.metadata,
        });
        return record;
      } catch (error) {
        const record = recordIntentStatus(store, verified, "failed", {
          errorReason: error instanceof Error ? error.message : "execution_failed",
        });
        throw Object.assign(error instanceof Error ? error : new Error("execution_failed"), {
          record,
        });
      }
    },
  };
}

export class InMemoryIntentExecutionStore implements IntentExecutionStore {
  private readonly records = new Map<string, IntentExecutionRecord>();

  record(record: IntentExecutionRecord): void {
    this.records.set(record.intentHash.toLowerCase(), record);
  }

  get(intentHash: string): IntentExecutionRecord | undefined {
    return this.records.get(intentHash.toLowerCase());
  }

  list(): IntentExecutionRecord[] {
    return [...this.records.values()];
  }
}

export function recordPaidIntent(
  store: IntentExecutionStore,
  verified: Extract<PaidIntentVerificationResult, { ok: true }>,
): IntentExecutionRecord {
  return recordIntentStatus(store, verified, "paid");
}

export function recordIntentStatus(
  store: IntentExecutionStore,
  verified: Extract<PaidIntentVerificationResult, { ok: true }>,
  status: IntentExecutionStatus,
  details: Partial<IntentExecutionReceipt> = {},
): IntentExecutionRecord {
  const existing = store.get(verified.intentHash);
  const now = new Date().toISOString();
  const record: IntentExecutionRecord = {
    version: X402_HL_INTENT_VERSION,
    status,
    intentHash: verified.intentHash,
    quoteId: verified.intent.quoteId,
    payer: verified.payer,
    paymentNetwork: verified.settlement?.network,
    paymentTransaction: verified.settlement?.transaction,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    intent: verified.intent,
    signedIntent: verified.signedIntent,
    settlement: verified.settlement,
    ...details,
  };

  store.record(record);
  return record;
}

function payerFromPaymentPayload(paymentPayload: PaymentPayload): string | undefined {
  const maybeUser = paymentPayload.payload?.user;
  return typeof maybeUser === "string" ? maybeUser : undefined;
}
