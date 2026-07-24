import {
  HyperEvmExecutionIntent,
  HyperEvmExecutionIntentSchema,
  IntentExecutionReceipt,
  IntentExecutionReceiptSchema,
  IntentExecutionStatus,
  JsonValue,
} from "../types";
import { canonicalizeTransactionIdentifier } from "./identifiers";

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
  | { kind: "duplicate_payment"; record: IntentExecutionRecord }
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

interface IntentExecutionTransitionBase {
  intentHash: string;
  expectedRevision: number;
  from: IntentExecutionStatus;
  to: IntentExecutionStatus;
  /** Required when the current record has an active claim token. */
  claimToken?: string;
  patch?: IntentExecutionTransitionPatch;
}

export type IntentExecutionTransition = IntentExecutionTransitionBase &
  (
    | { paymentNetwork?: never; paymentTransaction?: never }
    | {
        /** Selects a duplicate-payment record instead of the primary intent record. */
        paymentNetwork: string;
        /** Selects a duplicate-payment record instead of the primary intent record. */
        paymentTransaction: string;
      }
  );

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
 * `registerPaid` requires unique indexes on the primary intent hash,
 * (application, gateway, quote id), and every (payment network, payment
 * transaction). A second transaction for the same intent must be inserted as a
 * duplicate-payment refund record by that same atomic operation. `transition`
 * is a compare-and-swap over payment identity, revision, status, and claim
 * token. Implementations must also enforce unique execution and refund
 * transactions across primary and duplicate-payment records. Transaction
 * identifiers must be canonicalized with surrounding whitespace removed and
 * ASCII case folded before indexing or persistence.
 */
export interface IntentExecutionStore {
  registerPaid(record: IntentExecutionRecord): Promise<IntentStoreRegistrationResult>;
  get(intentHash: string): Promise<IntentExecutionRecord | undefined>;
  getPayment(
    paymentNetwork: string,
    paymentTransaction: string,
  ): Promise<IntentExecutionRecord | undefined>;
  transition(
    transition: IntentExecutionTransition,
  ): Promise<IntentStoreTransitionResult>;
}

type RecordLocator =
  | { kind: "primary"; intentKey: string }
  | { kind: "duplicate"; paymentKey: string };

/**
 * Single-process development/test store. It is not durable and must not be used
 * as a production replay boundary.
 */
export class InMemoryIntentExecutionStore implements IntentExecutionStore {
  private readonly records = new Map<string, IntentExecutionRecord>();
  private readonly duplicatePayments = new Map<string, IntentExecutionRecord>();
  private readonly quotes = new Map<string, string>();
  private readonly payments = new Map<string, RecordLocator>();
  private readonly executions = new Map<string, string>();
  private readonly refunds = new Map<string, string>();

  async registerPaid(
    input: IntentExecutionRecord,
  ): Promise<IntentStoreRegistrationResult> {
    const record = IntentExecutionRecordSchema.parse({
      ...input,
      paymentTransaction: canonicalizeTransactionIdentifier(
        input.paymentTransaction,
      ),
      executionTransaction: input.executionTransaction
        ? canonicalizeTransactionIdentifier(input.executionTransaction)
        : undefined,
      refundTransaction: input.refundTransaction
        ? canonicalizeTransactionIdentifier(input.refundTransaction)
        : undefined,
    });
    const intentKey = normalizeHash(record.intentHash);
    const paymentKey = transactionIndex(
      record.paymentNetwork,
      record.paymentTransaction,
    );

    const paymentOwner = this.payments.get(paymentKey);
    if (paymentOwner) {
      const paymentRecord = this.recordForLocator(paymentOwner);
      if (paymentRecord && samePaymentRegistration(paymentRecord, record)) {
        return paymentRecord.duplicatePayment
          ? { kind: "duplicate_payment", record: cloneRecord(paymentRecord) }
          : { kind: "existing", record: cloneRecord(paymentRecord) };
      }
      return {
        kind: "conflict",
        key: "payment_transaction",
        record: paymentRecord ? cloneRecord(paymentRecord) : undefined,
      };
    }

    const existing = this.records.get(intentKey);
    if (existing) {
      if (!sameIntentRegistration(existing, record)) {
        return {
          kind: "conflict",
          key: "intent_hash",
          record: cloneRecord(existing),
        };
      }

      const duplicate = IntentExecutionRecordSchema.parse({
        ...record,
        revision: 0,
        status: "refund_pending",
        duplicatePayment: true,
        executionNetwork: undefined,
        executionTransaction: undefined,
        refundNetwork: undefined,
        refundTransaction: undefined,
        executionAttempts: 0,
        refundAttempts: 0,
        claimToken: undefined,
        failure: {
          reason: "duplicate_payment",
          message: "An additional settled payment for this intent must be refunded",
          retryable: true,
        },
        updatedAt: new Date().toISOString(),
      });
      this.duplicatePayments.set(paymentKey, cloneRecord(duplicate));
      this.payments.set(paymentKey, { kind: "duplicate", paymentKey });
      return { kind: "duplicate_payment", record: cloneRecord(duplicate) };
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

    const stored = cloneRecord(record);
    this.records.set(intentKey, stored);
    this.quotes.set(quoteKey, intentKey);
    this.payments.set(paymentKey, { kind: "primary", intentKey });
    return { kind: "created", record: cloneRecord(stored) };
  }

  async get(intentHash: string): Promise<IntentExecutionRecord | undefined> {
    const record = this.records.get(normalizeHash(intentHash));
    return record ? cloneRecord(record) : undefined;
  }

  async getPayment(
    paymentNetwork: string,
    paymentTransaction: string,
  ): Promise<IntentExecutionRecord | undefined> {
    const locator = this.payments.get(
      transactionIndex(paymentNetwork, paymentTransaction),
    );
    const record = locator ? this.recordForLocator(locator) : undefined;
    return record ? cloneRecord(record) : undefined;
  }

  async transition(
    input: IntentExecutionTransition,
  ): Promise<IntentStoreTransitionResult> {
    const locator = this.transitionLocator(input);
    const current = locator ? this.recordForLocator(locator) : undefined;
    if (!locator || !current) return { kind: "not_found" };
    if (normalizeHash(current.intentHash) !== normalizeHash(input.intentHash)) {
      return { kind: "not_found" };
    }
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

    const patch = input.patch ?? {};
    const next = IntentExecutionRecordSchema.parse({
      ...current,
      ...patch,
      executionTransaction: patch.executionTransaction
        ? canonicalizeTransactionIdentifier(patch.executionTransaction)
        : current.executionTransaction,
      refundTransaction: patch.refundTransaction
        ? canonicalizeTransactionIdentifier(patch.refundTransaction)
        : current.refundTransaction,
      status: input.to,
      revision: current.revision + 1,
      updatedAt: new Date().toISOString(),
    });

    const ownerKey = locatorKey(locator);
    const transactionConflict = this.transactionConflict(ownerKey, current, next);
    if (transactionConflict) {
      return {
        kind: "conflict",
        key: transactionConflict,
        record: cloneRecord(current),
      };
    }

    this.storeForLocator(locator, next);
    if (next.executionNetwork && next.executionTransaction) {
      this.executions.set(
        transactionIndex(next.executionNetwork, next.executionTransaction),
        ownerKey,
      );
    }
    if (next.refundNetwork && next.refundTransaction) {
      this.refunds.set(
        transactionIndex(next.refundNetwork, next.refundTransaction),
        ownerKey,
      );
    }
    return { kind: "updated", record: cloneRecord(next) };
  }

  private transitionLocator(
    input: IntentExecutionTransition,
  ): RecordLocator | undefined {
    const hasPaymentNetwork = typeof input.paymentNetwork === "string";
    const hasPaymentTransaction = typeof input.paymentTransaction === "string";
    if (hasPaymentNetwork !== hasPaymentTransaction) return undefined;
    if (hasPaymentNetwork && hasPaymentTransaction) {
      return this.payments.get(
        transactionIndex(input.paymentNetwork!, input.paymentTransaction!),
      );
    }
    const intentKey = normalizeHash(input.intentHash);
    return this.records.has(intentKey)
      ? { kind: "primary", intentKey }
      : undefined;
  }

  private recordForLocator(locator: RecordLocator): IntentExecutionRecord | undefined {
    return locator.kind === "primary"
      ? this.records.get(locator.intentKey)
      : this.duplicatePayments.get(locator.paymentKey);
  }

  private storeForLocator(
    locator: RecordLocator,
    record: IntentExecutionRecord,
  ): void {
    if (locator.kind === "primary") {
      this.records.set(locator.intentKey, cloneRecord(record));
    } else {
      this.duplicatePayments.set(locator.paymentKey, cloneRecord(record));
    }
  }

  private transactionConflict(
    ownerKey: string,
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
      if (owner && owner !== ownerKey) return "execution_transaction";
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
      if (owner && owner !== ownerKey) return "refund_transaction";
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

function sameIntentRegistration(
  left: IntentExecutionRecord,
  right: IntentExecutionRecord,
): boolean {
  return (
    normalizeHash(left.intentHash) === normalizeHash(right.intentHash) &&
    left.intentTemplateHash.toLowerCase() ===
      right.intentTemplateHash.toLowerCase() &&
    left.application === right.application &&
    left.gateway.toLowerCase() === right.gateway.toLowerCase() &&
    left.quoteId === right.quoteId &&
    left.paymentRequirementsHash.toLowerCase() ===
      right.paymentRequirementsHash.toLowerCase() &&
    left.paymentScheme === right.paymentScheme &&
    left.paymentNetwork === right.paymentNetwork &&
    left.paymentAsset === right.paymentAsset &&
    left.paymentAmount === right.paymentAmount &&
    left.paymentPayTo.toLowerCase() === right.paymentPayTo.toLowerCase()
  );
}

function samePaymentRegistration(
  left: IntentExecutionRecord,
  right: IntentExecutionRecord,
): boolean {
  return (
    sameIntentRegistration(left, right) &&
    left.payer.toLowerCase() === right.payer.toLowerCase() &&
    canonicalizeTransactionIdentifier(left.paymentTransaction) ===
      canonicalizeTransactionIdentifier(right.paymentTransaction)
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
  return `${network}\u0000${canonicalizeTransactionIdentifier(transaction)}`;
}

function locatorKey(locator: RecordLocator): string {
  return locator.kind === "primary"
    ? `intent\u0000${locator.intentKey}`
    : `payment\u0000${locator.paymentKey}`;
}

function cloneRecord(record: IntentExecutionRecord): IntentExecutionRecord {
  return structuredClone(record);
}
