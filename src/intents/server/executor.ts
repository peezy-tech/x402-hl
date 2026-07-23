import { randomUUID } from "node:crypto";
import type { Address, Hex } from "viem";
import { getAddress, keccak256 } from "viem";
import {
  ExecutionIntentDomain,
  IntentFailure,
  IntentFailureReason,
  JsonValue,
  X402_HL_INTENT_VERSION,
  isTerminalIntentExecutionStatus,
} from "../types";
import type {
  PaidIntentVerificationInput,
  PaidIntentVerificationResult,
  VerifiedPaidExecutionIntent,
} from "./verification";
import {
  verifyPaidExecutionIntent,
} from "./verification";
import type {
  IntentExecutionRecord,
  IntentExecutionStore,
  IntentStoreTransitionResult,
} from "./store";

export interface IntentExecutionContext {
  intent: VerifiedPaidExecutionIntent["intent"];
  record: IntentExecutionRecord;
  /** Stable key that execution adapters must use for reconciliation. */
  idempotencyKey: string;
}

export type IntentPolicyDecision =
  | {
      allowed: true;
      chainId: number;
      target: Address | string;
      selector: Hex | string;
      callDataHash: Hex | string;
      value: string;
      recipient: Address | string;
      metadata?: Record<string, JsonValue>;
    }
  | { allowed: false };

export type IntentSimulationResult =
  | {
      success: true;
      chainId: number;
      target: Address | string;
      callDataHash: Hex | string;
      value: string;
      recipient: Address | string;
      gasCost: string;
      slippageBps: number;
      metadata?: Record<string, JsonValue>;
    }
  | { success: false };

export type IntentExecutionResult =
  | {
      success: true;
      /** Must mean a confirmed successful destination-chain receipt. */
      confirmed: true;
      transaction: string;
      network: string;
      metadata?: Record<string, JsonValue>;
    }
  | {
      success: false;
      /**
       * True only when the adapter knows no destination transaction succeeded
       * and refunding cannot double-pay the user.
       */
      refundSafe: boolean;
      mayHaveSucceeded?: boolean;
    };

export interface IntentRefundContext {
  intent: IntentExecutionRecord["intent"];
  record: IntentExecutionRecord;
  /** Stable key that refund adapters must use for reconciliation. */
  idempotencyKey: string;
}

export type IntentRefundResult =
  | {
      success: true;
      confirmed: true;
      transaction: string;
      network: string;
      metadata?: Record<string, JsonValue>;
    }
  | {
      success: false;
      retryable: boolean;
      mayHaveSucceeded?: boolean;
    };

export interface IntentExecutorConfig {
  /** A durable implementation is required in production. */
  store: IntentExecutionStore;
  domain: ExecutionIntentDomain;
  policy: (
    context: IntentExecutionContext,
  ) => Promise<IntentPolicyDecision> | IntentPolicyDecision;
  simulate: (
    context: IntentExecutionContext,
    policy: Extract<IntentPolicyDecision, { allowed: true }>,
  ) => Promise<IntentSimulationResult> | IntentSimulationResult;
  execute: (
    context: IntentExecutionContext,
    policy: Extract<IntentPolicyDecision, { allowed: true }>,
    simulation: Extract<IntentSimulationResult, { success: true }>,
  ) => Promise<IntentExecutionResult>;
  refund: (context: IntentRefundContext) => Promise<IntentRefundResult>;
  /** Intended for deterministic tests; production defaults to random UUIDs. */
  createClaimToken?: () => string;
  /** Intended for deterministic tests; production defaults to wall-clock time. */
  now?: () => number;
}

export class IntentStoreConflictError extends Error {
  readonly record?: IntentExecutionRecord;

  constructor(message: string, record?: IntentExecutionRecord) {
    super(message);
    this.name = "IntentStoreConflictError";
    this.record = record;
  }
}

export function createIntentExecutor(config: IntentExecutorConfig) {
  const claimToken = config.createClaimToken ?? randomUUID;
  const now = config.now ?? (() => Math.floor(Date.now() / 1000));

  return {
    store: config.store,

    async get(intentHash: string): Promise<IntentExecutionRecord | undefined> {
      return config.store.get(intentHash);
    },

    async verify(
      input: Omit<PaidIntentVerificationInput, "expectedDomain">,
    ): Promise<PaidIntentVerificationResult> {
      return verifyPaidExecutionIntent({
        ...input,
        expectedDomain: config.domain,
      });
    },

    /**
     * Deadline enforcement is deferred to the state machine rather than
     * pre-registration verification: a payment can settle after the signed
     * deadline lapses, and throwing at that point would leave the settled
     * payment with no durable record and no automated refund. Every other
     * verification failure still throws before registration because a
     * mismatched or unsigned intent has no trustworthy refund address.
     */
    async execute(
      input: Omit<
        PaidIntentVerificationInput,
        "expectedDomain" | "enforceDeadline"
      >,
    ): Promise<IntentExecutionRecord> {
      const verified = await verifyPaidExecutionIntent({
        ...input,
        expectedDomain: config.domain,
        enforceDeadline: false,
      });
      if (!verified.ok) {
        throw new Error(`${verified.reason}: ${verified.message}`);
      }

      const initial = createPaidRecord(verified, input);
      const registration = await config.store.registerPaid(initial);
      if (registration.kind === "conflict") {
        throw new IntentStoreConflictError(
          `store_conflict: ${registration.key}`,
          registration.record,
        );
      }

      let record = registration.record;
      if (isTerminalIntentExecutionStatus(record.status)) return record;
      if (record.status !== "paid") return record;

      const executionClaimToken = claimToken();
      const claim = await config.store.transition({
        intentHash: record.intentHash,
        expectedRevision: record.revision,
        from: "paid",
        to: "execution_claimed",
        patch: {
          claimToken: executionClaimToken,
          executionAttempts: record.executionAttempts + 1,
          failure: undefined,
        },
      });
      if (claim.kind !== "updated") return recordFromConflict(claim, record);
      record = claim.record;

      const claimedDeadlineFailure = verifyExecutionDeadline(record, now());
      if (claimedDeadlineFailure) {
        return failAndRefund(
          config,
          record,
          executionClaimToken,
          claimedDeadlineFailure,
          claimToken,
        );
      }

      const context = executionContext(record);
      let policy: IntentPolicyDecision;
      try {
        policy = await config.policy(context);
      } catch {
        return failAndRefund(
          config,
          record,
          executionClaimToken,
          safeFailure(
            "policy_denied",
            "Execution policy rejected the intent",
            false,
          ),
          claimToken,
        );
      }
      if (!policy.allowed) {
        return failAndRefund(
          config,
          record,
          executionClaimToken,
          safeFailure(
            "policy_denied",
            "Execution policy rejected the intent",
            false,
          ),
          claimToken,
        );
      }

      const policyFailure = verifyPolicyBinding(record, policy);
      if (policyFailure) {
        return failAndRefund(
          config,
          record,
          executionClaimToken,
          policyFailure,
          claimToken,
        );
      }

      let simulation: IntentSimulationResult;
      try {
        simulation = await config.simulate(context, policy);
      } catch {
        simulation = { success: false };
      }
      const simulationFailure = verifySimulation(record, simulation);
      if (simulationFailure || !simulation.success) {
        return failAndRefund(
          config,
          record,
          executionClaimToken,
          simulationFailure ??
            safeFailure(
              "simulation_failed",
              "Destination execution simulation failed",
              false,
            ),
          claimToken,
        );
      }

      const simulatedDeadlineFailure = verifyExecutionDeadline(record, now());
      if (simulatedDeadlineFailure) {
        return failAndRefund(
          config,
          record,
          executionClaimToken,
          simulatedDeadlineFailure,
          claimToken,
        );
      }

      const submitted = await config.store.transition({
        intentHash: record.intentHash,
        expectedRevision: record.revision,
        from: "execution_claimed",
        to: "execution_submitted",
        claimToken: executionClaimToken,
      });
      if (submitted.kind !== "updated") {
        return recordFromConflict(submitted, record);
      }
      record = submitted.record;

      const submittedDeadlineFailure = verifyExecutionDeadline(record, now());
      if (submittedDeadlineFailure) {
        return failAndRefund(
          config,
          record,
          executionClaimToken,
          submittedDeadlineFailure,
          claimToken,
        );
      }

      let execution: IntentExecutionResult;
      try {
        execution = await config.execute(
          executionContext(record),
          policy,
          simulation,
        );
      } catch {
        return markManualIntervention(
          config.store,
          record,
          executionClaimToken,
          safeFailure(
            "execution_uncertain",
            "Execution adapter threw after submission began; reconcile before retrying or refunding",
            false,
          ),
        );
      }

      if (!execution.success) {
        if (execution.mayHaveSucceeded || !execution.refundSafe) {
          return markManualIntervention(
            config.store,
            record,
            executionClaimToken,
            safeFailure(
              "execution_uncertain",
              "Execution outcome may have succeeded; automatic refund is unsafe",
              false,
            ),
          );
        }
        return failAndRefund(
          config,
          record,
          executionClaimToken,
          safeFailure(
            "execution_failed",
            "Destination execution failed definitively",
            false,
          ),
          claimToken,
        );
      }

      const expectedExecutionNetwork = `eip155:${record.intent.chainId}`;
      if (
        execution.confirmed !== true ||
        typeof execution.transaction !== "string" ||
        !execution.transaction.trim() ||
        execution.network !== expectedExecutionNetwork
      ) {
        return markManualIntervention(
          config.store,
          record,
          executionClaimToken,
          safeFailure(
            "execution_uncertain",
            "Executor did not return a confirmed receipt on the intended chain",
            false,
          ),
        );
      }

      const executed = await config.store.transition({
        intentHash: record.intentHash,
        expectedRevision: record.revision,
        from: "execution_submitted",
        to: "executed",
        claimToken: executionClaimToken,
        patch: {
          claimToken: undefined,
          executionNetwork: execution.network,
          executionTransaction: execution.transaction,
          failure: undefined,
          metadata: execution.metadata,
        },
      });
      if (executed.kind === "updated") return executed.record;

      return markManualAfterStoreConflict(
        config.store,
        record,
        executionClaimToken,
        executed,
      );
    },

    async retryRefund(intentHash: string): Promise<IntentExecutionRecord> {
      const record = await config.store.get(intentHash);
      if (!record) {
        throw new Error("invalid_state: intent record was not found");
      }
      if (isTerminalIntentExecutionStatus(record.status)) return record;
      if (record.status !== "refund_pending" && record.status !== "refund_failed") {
        return record;
      }
      return runRefund(config, record, claimToken);
    },

    /**
     * Resume an intent abandoned mid-transition, for example by a process
     * crash, using the claim token persisted on the record. Adapters are only
     * invoked after the matching `*_submitted` transition is durably recorded,
     * so pre-submission states refund safely while post-submission states park
     * in `manual_intervention` for reconciliation. Call only when no other
     * executor process can still be driving the intent.
     */
    async recover(intentHash: string): Promise<IntentExecutionRecord> {
      const record = await config.store.get(intentHash);
      if (!record) {
        throw new Error("invalid_state: intent record was not found");
      }
      if (isTerminalIntentExecutionStatus(record.status)) return record;

      switch (record.status) {
        case "execution_claimed":
          return failAndRefund(
            config,
            record,
            record.claimToken,
            safeFailure(
              "execution_failed",
              "Execution claim was abandoned before destination submission",
              false,
            ),
            claimToken,
          );
        case "execution_submitted":
          return markManualIntervention(
            config.store,
            record,
            record.claimToken,
            safeFailure(
              "execution_uncertain",
              "Execution was abandoned after submission began; reconcile before retrying or refunding",
              false,
            ),
          );
        case "execution_failed": {
          const pending = await config.store.transition({
            intentHash: record.intentHash,
            expectedRevision: record.revision,
            from: "execution_failed",
            to: "refund_pending",
            claimToken: record.claimToken,
            patch: { claimToken: undefined },
          });
          if (pending.kind !== "updated") {
            return recordFromConflict(pending, record);
          }
          return runRefund(config, pending.record, claimToken);
        }
        case "refund_claimed": {
          const released = await config.store.transition({
            intentHash: record.intentHash,
            expectedRevision: record.revision,
            from: "refund_claimed",
            to: "refund_failed",
            claimToken: record.claimToken,
            patch: {
              claimToken: undefined,
              failure: safeFailure(
                "refund_failed",
                "Refund claim was abandoned before submission and may be retried",
                true,
              ),
            },
          });
          if (released.kind !== "updated") {
            return recordFromConflict(released, record);
          }
          return runRefund(config, released.record, claimToken);
        }
        case "refund_submitted":
          return markManualIntervention(
            config.store,
            record,
            record.claimToken,
            safeFailure(
              "refund_uncertain",
              "Refund was abandoned after submission began; reconcile before another attempt",
              false,
            ),
          );
        case "refund_pending":
        case "refund_failed":
          return runRefund(config, record, claimToken);
        default:
          // `paid` records are re-driven idempotently through `execute`.
          return record;
      }
    },
  };
}

function createPaidRecord(
  verified: VerifiedPaidExecutionIntent,
  input: Omit<
    PaidIntentVerificationInput,
    "expectedDomain" | "enforceDeadline"
  >,
): IntentExecutionRecord {
  const now = new Date().toISOString();
  return {
    version: X402_HL_INTENT_VERSION,
    revision: 0,
    status: "paid",
    intentHash: verified.intentHash,
    intentTemplateHash: verified.intentTemplateHash,
    paymentRequirementsHash: verified.paymentRequirementsHash,
    quoteId: verified.intent.quoteId,
    application: verified.intent.application,
    gateway: verified.intent.gateway,
    payer: verified.payer,
    paymentScheme: input.paymentRequirements.scheme,
    paymentNetwork: verified.settlement.network,
    paymentAsset: input.paymentRequirements.asset,
    paymentAmount: input.paymentRequirements.amount,
    paymentPayTo: input.paymentRequirements.payTo,
    paymentTransaction: verified.settlement.transaction,
    executionAttempts: 0,
    refundAttempts: 0,
    createdAt: now,
    updatedAt: now,
    intent: verified.intent,
  };
}

function executionContext(record: IntentExecutionRecord): IntentExecutionContext {
  return {
    intent: record.intent,
    record,
    idempotencyKey: record.intentHash,
  };
}

function verifyPolicyBinding(
  record: IntentExecutionRecord,
  policy: Extract<IntentPolicyDecision, { allowed: true }>,
): IntentFailure | undefined {
  const expectedSelector =
    record.intent.callData.length >= 10
      ? record.intent.callData.slice(0, 10).toLowerCase()
      : "0x";
  try {
    const matches =
      policy.chainId === record.intent.chainId &&
      getAddress(policy.target) === getAddress(record.intent.target) &&
      policy.callDataHash.toLowerCase() ===
        keccak256(record.intent.callData as Hex).toLowerCase() &&
      policy.selector.toLowerCase() === expectedSelector &&
      policy.value === record.intent.value &&
      getAddress(policy.recipient) === getAddress(record.intent.recipient);
    if (matches) return undefined;
  } catch {
    // Return a stable failure below.
  }
  return safeFailure(
    "policy_binding_mismatch",
    "Execution policy did not authorize the exact signed chain, call, value, and recipient",
    false,
  );
}

function verifySimulation(
  record: IntentExecutionRecord,
  simulation: IntentSimulationResult,
): IntentFailure | undefined {
  if (!simulation.success) {
    return safeFailure(
      "simulation_failed",
      "Destination execution simulation failed",
      false,
    );
  }

  try {
    const matches =
      simulation.chainId === record.intent.chainId &&
      getAddress(simulation.target) === getAddress(record.intent.target) &&
      simulation.callDataHash.toLowerCase() ===
        keccak256(record.intent.callData as Hex).toLowerCase() &&
      simulation.value === record.intent.value &&
      getAddress(simulation.recipient) === getAddress(record.intent.recipient);
    if (!matches) {
      return safeFailure(
        "policy_binding_mismatch",
        "Simulation did not evaluate the exact signed execution",
        false,
      );
    }

    if (BigInt(simulation.gasCost) > BigInt(record.intent.maxGasCost)) {
      return safeFailure(
        "gas_cost_exceeded",
        "Simulated gas cost exceeds the signed maximum",
        false,
      );
    }
    if (
      !Number.isInteger(simulation.slippageBps) ||
      simulation.slippageBps < 0 ||
      simulation.slippageBps > record.intent.maxSlippageBps
    ) {
      return safeFailure(
        "slippage_exceeded",
        "Simulated slippage exceeds the signed maximum",
        false,
      );
    }
  } catch {
    return safeFailure(
      "simulation_failed",
      "Simulation returned invalid constraint evidence",
      false,
    );
  }
  return undefined;
}

function verifyExecutionDeadline(
  record: IntentExecutionRecord,
  now: number,
): IntentFailure | undefined {
  if (Number.isInteger(now) && record.intent.deadline >= now) return undefined;
  return safeFailure(
    "execution_intent_expired",
    "Execution intent expired before destination submission",
    false,
  );
}

async function failAndRefund(
  config: IntentExecutorConfig,
  record: IntentExecutionRecord,
  executionClaimToken: string | undefined,
  failure: IntentFailure,
  createClaimToken: () => string,
): Promise<IntentExecutionRecord> {
  const failed = await config.store.transition({
    intentHash: record.intentHash,
    expectedRevision: record.revision,
    from: record.status,
    to: "execution_failed",
    claimToken: executionClaimToken,
    patch: { failure },
  });
  if (failed.kind !== "updated") return recordFromConflict(failed, record);

  const pending = await config.store.transition({
    intentHash: failed.record.intentHash,
    expectedRevision: failed.record.revision,
    from: "execution_failed",
    to: "refund_pending",
    claimToken: executionClaimToken,
    patch: { claimToken: undefined },
  });
  if (pending.kind !== "updated") {
    return recordFromConflict(pending, failed.record);
  }
  return runRefund(config, pending.record, createClaimToken);
}

async function runRefund(
  config: IntentExecutorConfig,
  input: IntentExecutionRecord,
  createClaimToken: () => string,
): Promise<IntentExecutionRecord> {
  const refundClaimToken = createClaimToken();
  const claim = await config.store.transition({
    intentHash: input.intentHash,
    expectedRevision: input.revision,
    from: input.status,
    to: "refund_claimed",
    patch: {
      claimToken: refundClaimToken,
      refundAttempts: input.refundAttempts + 1,
    },
  });
  if (claim.kind !== "updated") return recordFromConflict(claim, input);

  const submitted = await config.store.transition({
    intentHash: claim.record.intentHash,
    expectedRevision: claim.record.revision,
    from: "refund_claimed",
    to: "refund_submitted",
    claimToken: refundClaimToken,
  });
  if (submitted.kind !== "updated") {
    return recordFromConflict(submitted, claim.record);
  }
  const record = submitted.record;

  let refund: IntentRefundResult;
  try {
    refund = await config.refund({
      intent: record.intent,
      record,
      idempotencyKey: `${record.intentHash}:refund`,
    });
  } catch {
    return markManualIntervention(
      config.store,
      record,
      refundClaimToken,
      safeFailure(
        "refund_uncertain",
        "Refund adapter threw after submission began; reconcile before retrying",
        false,
      ),
    );
  }

  if (refund.success) {
    if (
      refund.confirmed !== true ||
      typeof refund.transaction !== "string" ||
      !refund.transaction.trim() ||
      typeof refund.network !== "string" ||
      !refund.network.trim()
    ) {
      return markManualIntervention(
        config.store,
        record,
        refundClaimToken,
        safeFailure(
          "refund_uncertain",
          "Refund adapter did not return a confirmed transaction",
          false,
        ),
      );
    }

    const refunded = await config.store.transition({
      intentHash: record.intentHash,
      expectedRevision: record.revision,
      from: "refund_submitted",
      to: "refunded",
      claimToken: refundClaimToken,
      patch: {
        claimToken: undefined,
        refundNetwork: refund.network,
        refundTransaction: refund.transaction,
        failure: undefined,
        metadata: refund.metadata,
      },
    });
    if (refunded.kind === "updated") return refunded.record;
    return markManualAfterStoreConflict(
      config.store,
      record,
      refundClaimToken,
      refunded,
    );
  }

  if (refund.mayHaveSucceeded) {
    return markManualIntervention(
      config.store,
      record,
      refundClaimToken,
      safeFailure(
        "refund_uncertain",
        "Refund may have succeeded; reconcile before another attempt",
        false,
      ),
    );
  }

  if (!refund.retryable) {
    return markManualIntervention(
      config.store,
      record,
      refundClaimToken,
      safeFailure(
        "refund_failed",
        "Refund failed and requires manual intervention",
        false,
      ),
    );
  }

  const failed = await config.store.transition({
    intentHash: record.intentHash,
    expectedRevision: record.revision,
    from: "refund_submitted",
    to: "refund_failed",
    claimToken: refundClaimToken,
    patch: {
      claimToken: undefined,
      failure: safeFailure(
        "refund_failed",
        "Refund failed and may be retried explicitly",
        true,
      ),
    },
  });
  return failed.kind === "updated"
    ? failed.record
    : recordFromConflict(failed, record);
}

async function markManualAfterStoreConflict(
  store: IntentExecutionStore,
  record: IntentExecutionRecord,
  claimToken: string,
  conflict: IntentStoreTransitionResult,
): Promise<IntentExecutionRecord> {
  if (conflict.kind === "conflict" && conflict.record.revision !== record.revision) {
    return conflict.record;
  }
  return markManualIntervention(
    store,
    record,
    claimToken,
    safeFailure(
      "store_conflict",
      "Durable store rejected transaction evidence; reconcile manually",
      false,
    ),
  );
}

async function markManualIntervention(
  store: IntentExecutionStore,
  record: IntentExecutionRecord,
  claimToken: string | undefined,
  failure: IntentFailure,
): Promise<IntentExecutionRecord> {
  const manual = await store.transition({
    intentHash: record.intentHash,
    expectedRevision: record.revision,
    from: record.status,
    to: "manual_intervention",
    claimToken,
    patch: {
      claimToken: undefined,
      failure,
    },
  });
  return manual.kind === "updated"
    ? manual.record
    : recordFromConflict(manual, record);
}

function safeFailure(
  reason: IntentFailureReason,
  message: string,
  retryable: boolean,
): IntentFailure {
  return { reason, message, retryable };
}

function recordFromConflict(
  result: IntentStoreTransitionResult,
  fallback: IntentExecutionRecord,
): IntentExecutionRecord {
  return result.kind === "conflict" ? result.record : fallback;
}
