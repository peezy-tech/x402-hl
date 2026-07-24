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
 * refund-only duplicate payment and maps `INSERT ... ON CONFLICT` results.
 * `compareAndSwap` uses the payment identity, revision, status, and claim token.
 * Both methods must return the row that won a conflict so a worker can
 * reconcile safely.
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
  findByPayment(
    paymentNetwork: string,
    paymentTransaction: string,
  ): Promise<unknown | undefined>;
}

/**
 * Representative schema for the PostgresIntentDatabase implementation.
 * Store the validated record as JSONB while duplicating concurrency/index keys.
 */
export const POSTGRES_INTENT_STORE_DDL = `
CREATE TABLE x402_intent_payment (
  payment_network text NOT NULL,
  payment_transaction text NOT NULL
    CHECK (payment_transaction = lower(payment_transaction)),
  intent_hash text NOT NULL CHECK (intent_hash = lower(intent_hash)),
  primary_payment boolean NOT NULL,
  application text NOT NULL,
  gateway text NOT NULL,
  quote_id text NOT NULL,
  execution_network text,
  execution_transaction text
    CHECK (execution_transaction IS NULL OR execution_transaction = lower(execution_transaction)),
  refund_network text,
  refund_transaction text
    CHECK (refund_transaction IS NULL OR refund_transaction = lower(refund_transaction)),
  revision integer NOT NULL,
  status text NOT NULL,
  claim_token text,
  record jsonb NOT NULL,
  PRIMARY KEY (payment_network, payment_transaction)
);
CREATE UNIQUE INDEX x402_intent_primary
  ON x402_intent_payment (intent_hash)
  WHERE primary_payment;
CREATE UNIQUE INDEX x402_intent_quote
  ON x402_intent_payment (application, gateway, quote_id)
  WHERE primary_payment;
CREATE UNIQUE INDEX x402_intent_execution_tx
  ON x402_intent_payment (execution_network, execution_transaction)
  WHERE execution_transaction IS NOT NULL;
CREATE UNIQUE INDEX x402_intent_refund_tx
  ON x402_intent_payment (refund_network, refund_transaction)
  WHERE refund_transaction IS NOT NULL;
`;

export class PostgresIntentExecutionStore implements IntentExecutionStore {
  constructor(private readonly database: PostgresIntentDatabase) {}

  async registerPaid(
    input: IntentExecutionRecord,
  ): Promise<IntentStoreRegistrationResult> {
    const record = IntentExecutionRecordSchema.parse(input);
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
      paymentTransaction.toLowerCase(),
    );
    return row == null ? undefined : IntentExecutionRecordSchema.parse(row);
  }

  async transition(
    transition: IntentExecutionTransition,
  ): Promise<IntentStoreTransitionResult> {
    return this.database.transaction(transaction =>
      transaction.compareAndSwap(transition),
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
