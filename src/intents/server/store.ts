import {
  HyperEvmExecutionIntent,
  HyperEvmExecutionIntentSchema,
  IntentExecutionReceipt,
  IntentExecutionReceiptSchema,
  IntentExecutionStatus,
  JsonValue,
} from "../types";

export const IntentExecutionRecordSchema = IntentExecutionReceiptSchema.extend({
  intent: HyperEvmExecutionIntentSchema,
});

export type IntentExecutionRecord = IntentExecutionReceipt & {
  intent: HyperEvmExecutionIntent;
};

export type IntentStoreConflictKey =
  | "intent_hash"
  | "quote_id"
  | "payment_transaction"
  | "execution_transaction"
  | "refund_transaction";

export type IntentStoreRegistrationResult =
  | { kind: "created"; record: IntentExecutionRecord }
  | { kind: "existing"; record: IntentExecutionRecord }
  | {
      kind: "conflict";
      key: IntentStoreConflictKey;
      record?: IntentExecutionRecord;
    };

export interface IntentExecutionTransitionPatch {
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

export interface IntentExecutionTransition {
  intentHash: string;
  expectedRevision: number;
  from: IntentExecutionStatus;
  to: IntentExecutionStatus;
  /** Required when the current record has an active claim token. */
  claimToken?: string;
  patch?: IntentExecutionTransitionPatch;
}

export type IntentStoreTransitionResult =
  | { kind: "updated"; record: IntentExecutionRecord }
  | { kind: "not_found" }
  | {
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
export interface IntentExecutionStore {
  registerPaid(record: IntentExecutionRecord): Promise<IntentStoreRegistrationResult>;
  get(intentHash: string): Promise<IntentExecutionRecord | undefined>;
  transition(
    transition: IntentExecutionTransition,
  ): Promise<IntentStoreTransitionResult>;
}

/**
 * Single-process development/test store. It is not durable and must not be used
 * as a production replay boundary.
 */
export class InMemoryIntentExecutionStore implements IntentExecutionStore {
  private readonly records = new Map<string, IntentExecutionRecord>();
  private readonly quotes = new Map<string, string>();
  private readonly payments = new Map<string, string>();
  private readonly executions = new Map<string, string>();
  private readonly refunds = new Map<string, string>();

  async registerPaid(
    input: IntentExecutionRecord,
  ): Promise<IntentStoreRegistrationResult> {
    const record = IntentExecutionRecordSchema.parse(input);
    const intentKey = normalizeHash(record.intentHash);
    const existing = this.records.get(intentKey);
    if (existing) {
      return sameRegistration(existing, record)
        ? { kind: "existing", record: cloneRecord(existing) }
        : {
            kind: "conflict",
            key: "intent_hash",
            record: cloneRecord(existing),
          };
    }

    const quoteKey = quoteIndex(record);
    const quoteOwner = this.quotes.get(quoteKey);
    if (quoteOwner) {
      return {
        kind: "conflict",
        key: "quote_id",
        record: cloneRecord(this.records.get(quoteOwner) as IntentExecutionRecord),
      };
    }

    const paymentKey = transactionIndex(
      record.paymentNetwork,
      record.paymentTransaction,
    );
    const paymentOwner = this.payments.get(paymentKey);
    if (paymentOwner) {
      return {
        kind: "conflict",
        key: "payment_transaction",
        record: cloneRecord(this.records.get(paymentOwner) as IntentExecutionRecord),
      };
    }

    const stored = cloneRecord(record);
    this.records.set(intentKey, stored);
    this.quotes.set(quoteKey, intentKey);
    this.payments.set(paymentKey, intentKey);
    return { kind: "created", record: cloneRecord(stored) };
  }

  async get(intentHash: string): Promise<IntentExecutionRecord | undefined> {
    const record = this.records.get(normalizeHash(intentHash));
    return record ? cloneRecord(record) : undefined;
  }

  async transition(
    input: IntentExecutionTransition,
  ): Promise<IntentStoreTransitionResult> {
    const intentKey = normalizeHash(input.intentHash);
    const current = this.records.get(intentKey);
    if (!current) return { kind: "not_found" };
    if (current.revision !== input.expectedRevision) {
      return {
        kind: "conflict",
        key: "revision",
        record: cloneRecord(current),
      };
    }
    if (current.status !== input.from) {
      return {
        kind: "conflict",
        key: "status",
        record: cloneRecord(current),
      };
    }
    if (current.claimToken && current.claimToken !== input.claimToken) {
      return {
        kind: "conflict",
        key: "claim_token",
        record: cloneRecord(current),
      };
    }
    if (!isLegalTransition(input.from, input.to)) {
      return {
        kind: "conflict",
        key: "status",
        record: cloneRecord(current),
      };
    }

    const next = IntentExecutionRecordSchema.parse({
      ...current,
      ...(input.patch ?? {}),
      status: input.to,
      revision: current.revision + 1,
      updatedAt: new Date().toISOString(),
    });

    const transactionConflict = this.transactionConflict(intentKey, current, next);
    if (transactionConflict) {
      return {
        kind: "conflict",
        key: transactionConflict,
        record: cloneRecord(current),
      };
    }

    this.records.set(intentKey, cloneRecord(next));
    if (next.executionNetwork && next.executionTransaction) {
      this.executions.set(
        transactionIndex(next.executionNetwork, next.executionTransaction),
        intentKey,
      );
    }
    if (next.refundNetwork && next.refundTransaction) {
      this.refunds.set(
        transactionIndex(next.refundNetwork, next.refundTransaction),
        intentKey,
      );
    }
    return { kind: "updated", record: cloneRecord(next) };
  }

  private transactionConflict(
    intentKey: string,
    current: IntentExecutionRecord,
    next: IntentExecutionRecord,
  ): "execution_transaction" | "refund_transaction" | undefined {
    if (
      next.executionNetwork &&
      next.executionTransaction &&
      (next.executionNetwork !== current.executionNetwork ||
        next.executionTransaction !== current.executionTransaction)
    ) {
      const owner = this.executions.get(
        transactionIndex(next.executionNetwork, next.executionTransaction),
      );
      if (owner && owner !== intentKey) return "execution_transaction";
    }
    if (
      next.refundNetwork &&
      next.refundTransaction &&
      (next.refundNetwork !== current.refundNetwork ||
        next.refundTransaction !== current.refundTransaction)
    ) {
      const owner = this.refunds.get(
        transactionIndex(next.refundNetwork, next.refundTransaction),
      );
      if (owner && owner !== intentKey) return "refund_transaction";
    }
    return undefined;
  }
}

const LEGAL_TRANSITIONS: Record<
  IntentExecutionStatus,
  readonly IntentExecutionStatus[]
> = {
  paid: ["execution_claimed"],
  execution_claimed: [
    "execution_submitted",
    "execution_failed",
    "manual_intervention",
  ],
  execution_submitted: [
    "executed",
    "execution_failed",
    "manual_intervention",
  ],
  executed: [],
  execution_failed: ["refund_pending", "manual_intervention"],
  refund_pending: ["refund_claimed", "manual_intervention"],
  refund_claimed: ["refund_submitted", "refund_failed", "manual_intervention"],
  refund_submitted: ["refunded", "refund_failed", "manual_intervention"],
  refunded: [],
  refund_failed: ["refund_claimed", "manual_intervention"],
  manual_intervention: [],
};

export function isLegalIntentExecutionTransition(
  from: IntentExecutionStatus,
  to: IntentExecutionStatus,
): boolean {
  return isLegalTransition(from, to);
}

function isLegalTransition(
  from: IntentExecutionStatus,
  to: IntentExecutionStatus,
): boolean {
  return LEGAL_TRANSITIONS[from].includes(to);
}

function sameRegistration(
  left: IntentExecutionRecord,
  right: IntentExecutionRecord,
): boolean {
  return (
    normalizeHash(left.intentHash) === normalizeHash(right.intentHash) &&
    left.application === right.application &&
    left.gateway.toLowerCase() === right.gateway.toLowerCase() &&
    left.quoteId === right.quoteId &&
    left.paymentRequirementsHash.toLowerCase() ===
      right.paymentRequirementsHash.toLowerCase() &&
    left.paymentNetwork === right.paymentNetwork &&
    left.paymentTransaction.toLowerCase() ===
      right.paymentTransaction.toLowerCase()
  );
}

function normalizeHash(value: string): string {
  return value.toLowerCase();
}

function quoteIndex(record: IntentExecutionRecord): string {
  return [
    record.application,
    record.gateway.toLowerCase(),
    record.quoteId,
  ].join("\u0000");
}

function transactionIndex(network: string, transaction: string): string {
  return `${network}\u0000${transaction.toLowerCase()}`;
}

function cloneRecord(record: IntentExecutionRecord): IntentExecutionRecord {
  return structuredClone(record);
}
