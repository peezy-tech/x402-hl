import type {
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements,
  SettleResponse,
} from "@x402/core/types";
import {
  PAYMENT_IDENTIFIER,
  appendPaymentIdentifierToExtensions,
  declarePaymentIdentifierExtension,
  extractAndValidatePaymentIdentifier,
} from "@x402/extensions/payment-identifier";
import {
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  keccak256,
  toFunctionSelector,
} from "viem";
import type { Address, Hex } from "viem";
import type { IntentSigner } from "x402-hl/intents";
import {
  X402_HL_INTENTS_EXTRA_KEY,
  attachSignedExecutionIntent,
  hashIntentText,
} from "x402-hl/intents";
import {
  signDeclaredExecutionIntent,
} from "x402-hl/intents/client";
import {
  IntentExecutionRecordSchema,
  createIntentExecutor,
  createIntentQuote,
} from "x402-hl/intents/server";
import type {
  IntentExecutionContext,
  IntentExecutionRecord,
  IntentExecutionStore,
  IntentExecutionTransition,
  IntentPolicyDecision,
  IntentStoreRegistrationResult,
  IntentStoreTransitionResult,
  ResolvedIntentQuote,
} from "x402-hl/intents/server";

const HYPERLIQUID_TESTNET = "hyperliquid:testnet" as const;
const HYPEREVM_TESTNET_CHAIN_ID = 998;
const PAY_TO = "0x0000000000000000000000000000000000004020" as const;
const INTENT_GATEWAY = "0x0000000000000000000000000000000000008080" as const;
const ALLOWED_TOKEN = "0x0000000000000000000000000000000000001000" as const;

export const INTENT_DOMAIN = {
  application: "api.example.com/v1/execute",
  gateway: INTENT_GATEWAY,
} as const;

const TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
] as const;

const TRANSFER_SELECTOR = toFunctionSelector("transfer(address,uint256)");
const ALLOWED_CALLS = new Set([
  canonicalCallKey(
    HYPEREVM_TESTNET_CHAIN_ID,
    ALLOWED_TOKEN,
    TRANSFER_SELECTOR,
  ),
]);

export interface TransferQuoteInput {
  quoteId: string;
  paymentIdentifier: string;
  user: Address;
  recipient: Address;
  tokenAmount: bigint;
  nowSeconds: number;
}

/**
 * Creates a server-owned quote. Production callers persist the quote id,
 * template hash, deadline, and payment identifier before returning the 402.
 */
export function createTransferQuote(input: TransferQuoteInput): {
  quote: ResolvedIntentQuote;
  paymentRequirements: PaymentRequirements;
  paymentRequired: PaymentRequired;
  paymentIdentifier: string;
} {
  const recipient = getAddress(input.recipient);
  const paymentIdentifierHash = hashIntentText(input.paymentIdentifier);
  const quote = createIntentQuote({
    id: input.quoteId,
    network: HYPERLIQUID_TESTNET,
    price: "$0.01",
    payTo: PAY_TO,
    maxTimeoutSeconds: 300,
    description: "Execute one allowlisted HyperEVM token transfer",
    intent: {
      ...INTENT_DOMAIN,
      user: getAddress(input.user),
      chainId: HYPEREVM_TESTNET_CHAIN_ID,
      target: ALLOWED_TOKEN,
      callData: encodeFunctionData({
        abi: TRANSFER_ABI,
        functionName: "transfer",
        args: [recipient, input.tokenAmount],
      }),
      value: "0",
      recipient,
      refundAddress: getAddress(input.user),
      maxGasCost: "2500000000000000",
      maxSlippageBps: 50,
      deadline: input.nowSeconds + 300,
      nonce: `${input.quoteId}:intent`,
      metadata: {
        operation: "erc20-transfer",
        tokenAmount: input.tokenAmount.toString(),
        paymentIdentifierHash: paymentIdentifierHash,
      },
    },
  });

  // A real x402 server scheme normally resolves price into this finalized
  // requirement. The intent signs this exact object, including every `extra`.
  const paymentRequirements = {
    scheme: "exact",
    network: HYPERLIQUID_TESTNET,
    amount: "1000000",
    asset: "USDC:0xeb62eee3685fc4c43992febcd9e75443",
    payTo: PAY_TO,
    maxTimeoutSeconds: 300,
    extra: {
      [X402_HL_INTENTS_EXTRA_KEY]: quote.paymentExtra,
      decimals: 8,
      tokenSymbol: "USDC",
      paymentIdentifierHash: paymentIdentifierHash,
    },
  } satisfies PaymentRequirements;

  const paymentRequired = {
    x402Version: 2,
    resource: {
      url: "https://api.example.com/v1/execute",
      description: "Allowlisted HyperEVM execution",
      mimeType: "application/json",
    },
    accepts: [paymentRequirements],
    extensions: {
      ...quote.routeConfig.extensions,
      [PAYMENT_IDENTIFIER]: declarePaymentIdentifierExtension(true),
    },
  } satisfies PaymentRequired;

  return {
    quote,
    paymentRequirements,
    paymentRequired,
    paymentIdentifier: input.paymentIdentifier,
  };
}

/**
 * Enriches a payment-scheme payload on the client.
 *
 * Inject a wallet, HSM, or KMS-backed signer. Do not log the signer, signature,
 * scheme payload, or the returned signed intent.
 */
export async function signClientIntent(input: {
  basePaymentPayload: PaymentPayload;
  paymentRequired: PaymentRequired;
  quote: ResolvedIntentQuote;
  paymentIdentifier: string;
  signer: IntentSigner;
}): Promise<PaymentPayload> {
  const paymentIdentifierDeclaration =
    input.paymentRequired.extensions?.[PAYMENT_IDENTIFIER];
  if (paymentIdentifierDeclaration == null) {
    throw new Error("Server did not declare the payment-identifier extension");
  }
  const extensions = {
    ...(input.basePaymentPayload.extensions ?? {}),
    // appendPaymentIdentifierToExtensions mutates `info`, so clone the
    // server declaration rather than mutating a cached PaymentRequired.
    [PAYMENT_IDENTIFIER]: structuredClone(paymentIdentifierDeclaration),
  };
  appendPaymentIdentifierToExtensions(extensions, input.paymentIdentifier);
  const identifiedPayload: PaymentPayload = {
    ...input.basePaymentPayload,
    extensions,
  };

  const signedIntent = await signDeclaredExecutionIntent(
    identifiedPayload,
    input.paymentRequired,
    {
      signer: input.signer,
      domain: INTENT_DOMAIN,
      // Supplying the locally constructed intent prevents silently approving
      // a server declaration that differs from the user's requested action.
      intent: input.quote.intent,
    },
  );
  if (!signedIntent) {
    throw new Error("Server did not declare the required execution intent");
  }

  return attachSignedExecutionIntent(identifiedPayload, signedIntent);
}

/**
 * Minimal durable adapter boundary. The database implementation must execute
 * both writes transactionally and return the library conflict types.
 *
 * `insertPaid` atomically inserts either the primary intent payment or a
 * refund-only duplicate payment and maps `INSERT ... ON CONFLICT` results. Its
 * conflict target must use `x402_intent_payment_tx_canonical`, not only the raw
 * primary key. `compareAndSwap` locates payment rows through
 * `x402_canonical_transaction(payment_transaction)` before checking revision,
 * status, and claim token. Both methods must return the row that won a conflict
 * so a worker can reconcile safely.
 */
export interface PostgresIntentTransaction {
  insertPaid(
    record: IntentExecutionRecord,
  ): Promise<IntentStoreRegistrationResult>;
  compareAndSwap(
    transition: IntentExecutionTransition,
  ): Promise<IntentStoreTransitionResult>;
}

export interface PostgresIntentDatabase {
  transaction<T>(
    operation: (transaction: PostgresIntentTransaction) => Promise<T>,
  ): Promise<T>;
  findByIntentHash(intentHash: string): Promise<unknown | undefined>;
  /**
   * Compare the supplied canonical key to
   * `x402_canonical_transaction(payment_transaction)`. Raw equality would miss
   * a pre-migration padded row during a rolling deployment.
   */
  findByPayment(
    paymentNetwork: string,
    paymentTransaction: string,
  ): Promise<unknown | undefined>;
}

/**
 * Representative schema for the PostgresIntentDatabase implementation.
 * Store the validated record as JSONB while duplicating concurrency/index keys.
 * The SQL function intentionally matches ECMAScript trim plus ASCII case folding.
 */
export const POSTGRES_INTENT_STORE_DDL = String.raw`
CREATE FUNCTION x402_canonical_transaction(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog
AS $function$
  SELECT pg_catalog.translate(
    pg_catalog.btrim(value, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'),
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    'abcdefghijklmnopqrstuvwxyz'
  )
$function$;

CREATE TABLE x402_intent_payment (
  payment_network text NOT NULL,
  payment_transaction text NOT NULL
    CONSTRAINT x402_payment_transaction_canonical
    CHECK (payment_transaction = x402_canonical_transaction(payment_transaction)),
  intent_hash text NOT NULL CHECK (intent_hash = lower(intent_hash)),
  primary_payment boolean NOT NULL,
  application text NOT NULL,
  gateway text NOT NULL,
  quote_id text NOT NULL,
  execution_network text,
  execution_transaction text
    CONSTRAINT x402_execution_transaction_canonical
    CHECK (execution_transaction IS NULL OR execution_transaction = x402_canonical_transaction(execution_transaction)),
  refund_network text,
  refund_transaction text
    CONSTRAINT x402_refund_transaction_canonical
    CHECK (refund_transaction IS NULL OR refund_transaction = x402_canonical_transaction(refund_transaction)),
  revision integer NOT NULL,
  status text NOT NULL,
  claim_token text,
  record jsonb NOT NULL,
  PRIMARY KEY (payment_network, payment_transaction)
);
CREATE UNIQUE INDEX x402_intent_payment_tx_canonical
  ON x402_intent_payment (
    payment_network,
    x402_canonical_transaction(payment_transaction)
  );
CREATE UNIQUE INDEX x402_intent_primary
  ON x402_intent_payment (intent_hash)
  WHERE primary_payment;
CREATE UNIQUE INDEX x402_intent_quote
  ON x402_intent_payment (application, lower(gateway), quote_id)
  WHERE primary_payment;
CREATE UNIQUE INDEX x402_intent_execution_tx_canonical
  ON x402_intent_payment (
    execution_network,
    x402_canonical_transaction(execution_transaction)
  )
  WHERE execution_transaction IS NOT NULL;
CREATE UNIQUE INDEX x402_intent_refund_tx_canonical
  ON x402_intent_payment (
    refund_network,
    x402_canonical_transaction(refund_transaction)
  )
  WHERE refund_transaction IS NOT NULL;
`;

/**
 * Run this migration before deploying the canonicalizing adapter over an older
 * table. It locks out writers, rejects ambiguous aliases or JSONB disagreement,
 * and updates the indexed columns and stored record atomically.
 */
export const POSTGRES_INTENT_STORE_CANONICALIZATION_MIGRATION_DDL = String.raw`
BEGIN;
LOCK TABLE x402_intent_payment IN ACCESS EXCLUSIVE MODE;

CREATE OR REPLACE FUNCTION x402_canonical_transaction(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog
AS $function$
  SELECT pg_catalog.translate(
    pg_catalog.btrim(value, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'),
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    'abcdefghijklmnopqrstuvwxyz'
  )
$function$;

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM x402_intent_payment
    GROUP BY payment_network, x402_canonical_transaction(payment_transaction)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'canonical payment transaction aliases require manual reconciliation';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM x402_intent_payment
    WHERE execution_transaction IS NOT NULL
    GROUP BY execution_network, x402_canonical_transaction(execution_transaction)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'canonical execution transaction aliases require manual reconciliation';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM x402_intent_payment
    WHERE refund_transaction IS NOT NULL
    GROUP BY refund_network, x402_canonical_transaction(refund_transaction)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'canonical refund transaction aliases require manual reconciliation';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM x402_intent_payment
    WHERE x402_canonical_transaction(payment_transaction) = ''
       OR (execution_transaction IS NOT NULL AND x402_canonical_transaction(execution_transaction) = '')
       OR (refund_transaction IS NOT NULL AND x402_canonical_transaction(refund_transaction) = '')
  ) THEN
    RAISE EXCEPTION 'canonical transaction identifiers must not be empty';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM x402_intent_payment
    WHERE x402_canonical_transaction(record->>'paymentTransaction')
            IS DISTINCT FROM x402_canonical_transaction(payment_transaction)
       OR x402_canonical_transaction(record->>'executionTransaction')
            IS DISTINCT FROM x402_canonical_transaction(execution_transaction)
       OR x402_canonical_transaction(record->>'refundTransaction')
            IS DISTINCT FROM x402_canonical_transaction(refund_transaction)
  ) THEN
    RAISE EXCEPTION 'transaction columns and record JSON require manual reconciliation';
  END IF;
END
$migration$;

UPDATE x402_intent_payment
SET payment_transaction = x402_canonical_transaction(payment_transaction),
    execution_transaction = x402_canonical_transaction(execution_transaction),
    refund_transaction = x402_canonical_transaction(refund_transaction),
    record =
      (record - 'paymentTransaction' - 'executionTransaction' - 'refundTransaction')
      || jsonb_build_object(
        'paymentTransaction',
        x402_canonical_transaction(payment_transaction)
      )
      || CASE
        WHEN execution_transaction IS NULL THEN '{}'::jsonb
        ELSE jsonb_build_object(
          'executionTransaction',
          x402_canonical_transaction(execution_transaction)
        )
      END
      || CASE
        WHEN refund_transaction IS NULL THEN '{}'::jsonb
        ELSE jsonb_build_object(
          'refundTransaction',
          x402_canonical_transaction(refund_transaction)
        )
      END;

DROP INDEX x402_intent_quote;
CREATE UNIQUE INDEX x402_intent_quote
  ON x402_intent_payment (application, lower(gateway), quote_id)
  WHERE primary_payment;
CREATE UNIQUE INDEX x402_intent_payment_tx_canonical
  ON x402_intent_payment (
    payment_network,
    x402_canonical_transaction(payment_transaction)
  );
CREATE UNIQUE INDEX x402_intent_execution_tx_canonical
  ON x402_intent_payment (
    execution_network,
    x402_canonical_transaction(execution_transaction)
  )
  WHERE execution_transaction IS NOT NULL;
CREATE UNIQUE INDEX x402_intent_refund_tx_canonical
  ON x402_intent_payment (
    refund_network,
    x402_canonical_transaction(refund_transaction)
  )
  WHERE refund_transaction IS NOT NULL;

ALTER TABLE x402_intent_payment
  ADD CONSTRAINT x402_payment_transaction_canonical
    CHECK (payment_transaction = x402_canonical_transaction(payment_transaction)),
  ADD CONSTRAINT x402_execution_transaction_canonical
    CHECK (execution_transaction IS NULL OR execution_transaction = x402_canonical_transaction(execution_transaction)),
  ADD CONSTRAINT x402_refund_transaction_canonical
    CHECK (refund_transaction IS NULL OR refund_transaction = x402_canonical_transaction(refund_transaction));
COMMIT;
`;

function canonicalTransaction(value: string): string {
  return value.trim().replace(/[A-Z]/g, character => character.toLowerCase());
}

function canonicalRecord(
  input: IntentExecutionRecord,
): IntentExecutionRecord {
  return IntentExecutionRecordSchema.parse({
    ...input,
    paymentTransaction: canonicalTransaction(input.paymentTransaction),
    executionTransaction: input.executionTransaction
      ? canonicalTransaction(input.executionTransaction)
      : undefined,
    refundTransaction: input.refundTransaction
      ? canonicalTransaction(input.refundTransaction)
      : undefined,
  });
}

function canonicalTransition(
  input: IntentExecutionTransition,
): IntentExecutionTransition {
  const patch = input.patch
    ? {
        ...input.patch,
        ...(input.patch.executionTransaction
          ? {
              executionTransaction: canonicalTransaction(
                input.patch.executionTransaction,
              ),
            }
          : {}),
        ...(input.patch.refundTransaction
          ? {
              refundTransaction: canonicalTransaction(
                input.patch.refundTransaction,
              ),
            }
          : {}),
      }
    : undefined;
  return "paymentTransaction" in input && input.paymentTransaction !== undefined
    ? {
        ...input,
        paymentTransaction: canonicalTransaction(input.paymentTransaction),
        patch,
      }
    : { ...input, patch };
}

export class PostgresIntentExecutionStore implements IntentExecutionStore {
  constructor(private readonly database: PostgresIntentDatabase) {}

  async registerPaid(
    input: IntentExecutionRecord,
  ): Promise<IntentStoreRegistrationResult> {
    const record = canonicalRecord(input);
    return this.database.transaction(transaction =>
      transaction.insertPaid(record),
    );
  }

  async get(intentHash: string): Promise<IntentExecutionRecord | undefined> {
    const row = await this.database.findByIntentHash(intentHash.toLowerCase());
    return row == null ? undefined : IntentExecutionRecordSchema.parse(row);
  }

  async getPayment(
    paymentNetwork: string,
    paymentTransaction: string,
  ): Promise<IntentExecutionRecord | undefined> {
    const row = await this.database.findByPayment(
      paymentNetwork,
      canonicalTransaction(paymentTransaction),
    );
    return row == null ? undefined : IntentExecutionRecordSchema.parse(row);
  }

  async transition(
    transition: IntentExecutionTransition,
  ): Promise<IntentStoreTransitionResult> {
    return this.database.transaction(transaction =>
      transaction.compareAndSwap(canonicalTransition(transition)),
    );
  }
}

export interface DestinationSimulation {
  success: boolean;
  gasCost: bigint;
  slippageBps: number;
}

export type DestinationExecutionOutcome =
  | {
      outcome: "confirmed_success";
      transaction: string;
      network: `eip155:${number}`;
    }
  | { outcome: "confirmed_failure" }
  | { outcome: "unknown" };

export type RefundOutcome =
  | {
      outcome: "confirmed_success";
      transaction: string;
      network: string;
    }
  | { outcome: "confirmed_failure"; retryable: boolean }
  | { outcome: "unknown" };

export interface DestinationChainAdapter {
  simulate(input: {
    chainId: number;
    target: Address;
    callData: Hex;
    value: bigint;
  }): Promise<DestinationSimulation>;
  executeAndWait(input: {
    chainId: number;
    target: Address;
    callData: Hex;
    value: bigint;
    idempotencyKey: string;
  }): Promise<DestinationExecutionOutcome>;
  refundAndWait(input: {
    paymentNetwork: string;
    paymentTransaction: string;
    refundAddress: Address;
    amount: string;
    idempotencyKey: string;
  }): Promise<RefundOutcome>;
}

/**
 * Authorizes only the canonical chain + checksummed target + four-byte
 * selector tuple, then decodes the ABI and validates semantic arguments.
 */
export function authorizeAllowlistedTransfer(
  context: IntentExecutionContext,
): IntentPolicyDecision {
  try {
    const target = getAddress(context.intent.target);
    const selector = context.intent.callData.slice(0, 10).toLowerCase();
    if (
      !ALLOWED_CALLS.has(
        canonicalCallKey(context.intent.chainId, target, selector),
      )
    ) {
      return { allowed: false };
    }

    const decoded = decodeFunctionData({
      abi: TRANSFER_ABI,
      data: context.intent.callData as Hex,
    });
    if (decoded.functionName !== "transfer") return { allowed: false };

    const [recipient, amount] = decoded.args;
    if (
      getAddress(recipient) !== getAddress(context.intent.recipient) ||
      amount <= 0n ||
      context.intent.value !== "0"
    ) {
      return { allowed: false };
    }

    return {
      allowed: true,
      chainId: context.intent.chainId,
      target,
      selector,
      callDataHash: keccak256(context.intent.callData as Hex),
      value: context.intent.value,
      recipient: context.intent.recipient,
      metadata: {
        function: "transfer",
        tokenAmount: amount.toString(),
      },
    };
  } catch {
    return { allowed: false };
  }
}

export function createProductionExecutor(input: {
  store: IntentExecutionStore;
  chain: DestinationChainAdapter;
  createClaimToken?: () => string;
}) {
  return createIntentExecutor({
    store: input.store,
    domain: INTENT_DOMAIN,
    createClaimToken: input.createClaimToken,
    policy: authorizeAllowlistedTransfer,
    async simulate(context) {
      const simulation = await input.chain.simulate({
        chainId: context.intent.chainId,
        target: getAddress(context.intent.target),
        callData: context.intent.callData as Hex,
        value: BigInt(context.intent.value),
      });
      if (!simulation.success) return { success: false };

      return {
        success: true,
        chainId: context.intent.chainId,
        target: context.intent.target,
        callDataHash: keccak256(context.intent.callData as Hex),
        value: context.intent.value,
        recipient: context.intent.recipient,
        gasCost: simulation.gasCost.toString(),
        slippageBps: simulation.slippageBps,
      };
    },
    async execute(context) {
      const outcome = await input.chain.executeAndWait({
        chainId: context.intent.chainId,
        target: getAddress(context.intent.target),
        callData: context.intent.callData as Hex,
        value: BigInt(context.intent.value),
        idempotencyKey: context.idempotencyKey,
      });

      if (outcome.outcome === "confirmed_success") {
        return {
          success: true,
          confirmed: true,
          transaction: outcome.transaction,
          network: outcome.network,
        };
      }
      if (outcome.outcome === "confirmed_failure") {
        // A definitive destination failure is refund-safe. The executor will
        // transition through execution_failed and invoke `refund` below.
        return {
          success: false,
          refundSafe: true,
          mayHaveSucceeded: false,
        };
      }
      // An unknown submission is never refunded automatically: doing so could
      // pay both the destination recipient and the payer.
      return {
        success: false,
        refundSafe: false,
        mayHaveSucceeded: true,
      };
    },
    async refund(context) {
      const outcome = await input.chain.refundAndWait({
        paymentNetwork: context.record.paymentNetwork,
        paymentTransaction: context.record.paymentTransaction,
        refundAddress: getAddress(context.intent.refundAddress),
        amount: context.record.paymentAmount,
        idempotencyKey: context.idempotencyKey,
      });

      if (outcome.outcome === "confirmed_success") {
        return {
          success: true,
          confirmed: true,
          transaction: outcome.transaction,
          network: outcome.network,
        };
      }
      if (outcome.outcome === "confirmed_failure") {
        return {
          success: false,
          retryable: outcome.retryable,
          mayHaveSucceeded: false,
        };
      }
      return {
        success: false,
        retryable: false,
        mayHaveSucceeded: true,
      };
    },
  });
}

export interface SafeAuditLogger {
  info(
    event: "intent_execution_finalized",
    fields: {
      intentHash: string;
      paymentIdentifierHash: string;
      paymentTransaction: string;
      status: IntentExecutionRecord["status"];
      executionTransaction?: string;
      refundTransaction?: string;
      failureReason?: string;
    },
  ): void;
}

function validatePaymentIdentifierBinding(input: {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
  quote: ResolvedIntentQuote;
}): Hex {
  const { id, validation } = extractAndValidatePaymentIdentifier(
    input.paymentPayload,
  );
  if (!validation.valid || !id) {
    throw new Error(
      validation.errors?.join("; ") ?? "Payment identifier is required",
    );
  }

  const identifierHash = hashIntentText(id);
  if (
    input.quote.intent.metadata?.paymentIdentifierHash !== identifierHash ||
    input.paymentRequirements.extra.paymentIdentifierHash !== identifierHash
  ) {
    throw new Error("Payment identifier does not match the signed quote");
  }
  return identifierHash;
}

/**
 * Called before settling the HyperCore payment. Every settlement-independent
 * check runs here — intent presence, canonical shape, domain, quote, template
 * hash, payment-requirements hash, deadline, and signature — so a payment is
 * never settled for an intent that `executeSettledIntent` would refuse to
 * register, which would burn the user's funds with no durable record or
 * automated refund. `quote` must come from server-owned durable state, never
 * from the client payload.
 */
export async function verifyIntentBeforeSettlement(input: {
  executor: ReturnType<typeof createProductionExecutor>;
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
  quote: ResolvedIntentQuote;
  nowSeconds: number;
}): Promise<void> {
  validatePaymentIdentifierBinding(input);
  const verified = await input.executor.verifyBeforeSettlement({
    paymentPayload: input.paymentPayload,
    paymentRequirements: input.paymentRequirements,
    expectedQuoteId: input.quote.id,
    expectedIntentTemplateHash: input.quote.intentTemplateHash,
    now: input.nowSeconds,
  });
  if (!verified.ok) {
    throw new Error(`${verified.reason}: ${verified.message}`);
  }
}

/**
 * Called only after `verifyIntentBeforeSettlement` passed and the exact
 * payment settled successfully. `quote` must come from server-owned durable
 * state, never from the client payload.
 */
export async function executeSettledIntent(input: {
  executor: ReturnType<typeof createProductionExecutor>;
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
  settleResponse: SettleResponse;
  quote: ResolvedIntentQuote;
  nowSeconds: number;
  logger: SafeAuditLogger;
}): Promise<IntentExecutionRecord> {
  // Repeat the pre-settlement payment-identifier validation as defense in depth.
  const identifierHash = validatePaymentIdentifierBinding(input);

  const record = await input.executor.execute({
    paymentPayload: input.paymentPayload,
    paymentRequirements: input.paymentRequirements,
    settleResponse: input.settleResponse,
    expectedQuoteId: input.quote.id,
    expectedIntentTemplateHash: input.quote.intentTemplateHash,
    now: input.nowSeconds,
  });

  // Explicit allowlist: never log signer objects, signatures, raw payment
  // payloads, calldata, authorization headers, or payment identifiers.
  input.logger.info("intent_execution_finalized", {
    intentHash: record.intentHash,
    paymentIdentifierHash: identifierHash,
    paymentTransaction: record.paymentTransaction,
    status: record.status,
    executionTransaction: record.executionTransaction,
    refundTransaction: record.refundTransaction,
    failureReason: record.failure?.reason,
  });
  return record;
}

/**
 * Deterministic, offline chain adapter for exercising both terminal paths.
 * Nothing in this file opens a socket or connects to a database.
 */
export function createOfflineChainAdapter(
  destinationOutcome: "success" | "definitive-failure",
): DestinationChainAdapter {
  return {
    async simulate() {
      return {
        success: true,
        gasCost: 500000000000000n,
        slippageBps: 20,
      };
    },
    async executeAndWait() {
      return destinationOutcome === "success"
        ? {
            outcome: "confirmed_success",
            transaction:
              "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            network: "eip155:998",
          }
        : { outcome: "confirmed_failure" };
    },
    async refundAndWait() {
      return {
        outcome: "confirmed_success",
        transaction:
          "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        network: HYPERLIQUID_TESTNET,
      };
    },
  };
}

function canonicalCallKey(
  chainId: number,
  target: string,
  selector: string,
): string {
  return `${chainId}:${getAddress(target)}:${selector.toLowerCase()}`;
}
