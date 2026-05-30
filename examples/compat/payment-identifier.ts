import { x402Client, x402HTTPClient } from "@x402/core/client";
import type { ClientExtension } from "@x402/core/client";
import type { PaymentPayload, PaymentRequired, PaymentRequirements } from "@x402/core/types";
import {
  PAYMENT_IDENTIFIER,
  appendPaymentIdentifierToExtensions,
  declarePaymentIdentifierExtension,
  extractAndValidatePaymentIdentifier,
  isPaymentIdentifierRequired,
} from "@x402/extensions/payment-identifier";
import { ExactHyperliquidScheme as ExactHyperliquidClient } from "x402-hl/exact/client";
import { ExactHyperliquidScheme as ExactHyperliquidServer } from "x402-hl/exact/server";
import { privateKeyToAccount } from "viem/accounts";

const HYPERLIQUID_TESTNET = "hyperliquid:testnet";
const PAYMENT_ID = "compat_hl_payment_identifier_0001";
const TEST_PRIVATE_KEY =
  "0x0000000000000000000000000000000000000000000000000000000000000001" as const;
const PAY_TO = "0x2222222222222222222222222222222222222222";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function paymentIdentifierClientExtension(id: string): ClientExtension {
  return {
    key: PAYMENT_IDENTIFIER,
    async enrichPaymentPayload(paymentPayload: PaymentPayload): Promise<PaymentPayload> {
      const extensions = { ...(paymentPayload.extensions ?? {}) };
      appendPaymentIdentifierToExtensions(extensions, id);
      return { ...paymentPayload, extensions };
    },
  };
}

const serverScheme = new ExactHyperliquidServer();
const parsedPrice = await serverScheme.parsePrice("$0.01", HYPERLIQUID_TESTNET);
const exactHyperliquidRequirement = await serverScheme.enhancePaymentRequirements(
  {
    scheme: "exact",
    network: HYPERLIQUID_TESTNET,
    amount: parsedPrice.amount,
    asset: parsedPrice.asset,
    payTo: PAY_TO,
    maxTimeoutSeconds: 300,
    extra: parsedPrice.extra ?? {},
  } satisfies PaymentRequirements,
  {
    x402Version: 2,
    scheme: "exact",
    network: HYPERLIQUID_TESTNET,
  },
  [],
);

const paymentRequired = {
  x402Version: 2,
  resource: {
    url: "https://example.test/hyperliquid-paid-resource",
    description: "Compatibility probe for x402-hl and payment-identifier",
    mimeType: "application/json",
  },
  accepts: [exactHyperliquidRequirement],
  extensions: {
    [PAYMENT_IDENTIFIER]: declarePaymentIdentifierExtension(true),
  },
} satisfies PaymentRequired;

assert(
  isPaymentIdentifierRequired(paymentRequired.extensions[PAYMENT_IDENTIFIER]),
  "payment-identifier declaration should require a client id",
);

const signer = privateKeyToAccount(TEST_PRIVATE_KEY);
const client = new x402Client()
  .register(HYPERLIQUID_TESTNET, new ExactHyperliquidClient(signer))
  .registerExtension(paymentIdentifierClientExtension(PAYMENT_ID));

const paymentPayload = await client.createPaymentPayload(paymentRequired);
const { id, validation } = extractAndValidatePaymentIdentifier(paymentPayload);
assert(validation.valid, validation.errors?.join("; ") ?? "payment identifier validation failed");
assert(id === PAYMENT_ID, "payment identifier was not copied into the payment payload");
assert(paymentPayload.accepted.scheme === "exact", "payment payload did not select exact scheme");
assert(
  paymentPayload.accepted.network === HYPERLIQUID_TESTNET,
  "payment payload did not select hyperliquid:testnet",
);

const exactPayload = paymentPayload.payload as {
  action?: {
    type?: string;
    destination?: string;
    token?: string;
    amount?: string;
    hyperliquidChain?: string;
  };
  signature?: unknown;
  nonce?: unknown;
  user?: string;
};

assert(exactPayload.action?.type === "spotSend", "exact Hyperliquid payload is not a spotSend action");
assert(exactPayload.action.destination === PAY_TO, "spotSend destination did not match payTo");
assert(exactPayload.action.token?.startsWith("USDC:"), "spotSend token should be Hyperliquid USDC");
assert(exactPayload.action.amount === "0.01", "spotSend amount should be decimal USDC");
assert(exactPayload.action.hyperliquidChain === "Testnet", "spotSend should target Hyperliquid testnet");
assert(typeof exactPayload.signature === "object", "exact Hyperliquid payload did not include a signature");
assert(typeof exactPayload.nonce === "number", "exact Hyperliquid payload did not include a nonce");
assert(exactPayload.user?.toLowerCase() === signer.address.toLowerCase(), "payload user did not match signer");

const headers = new x402HTTPClient(client).encodePaymentSignatureHeader(paymentPayload);
assert(Object.keys(headers).length > 0, "encoded payment payload did not produce HTTP headers");

console.log(JSON.stringify({
  ok: true,
  packageGraph: {
    x402Core: "upstream @x402/core",
    x402Extensions: "upstream @x402/extensions/payment-identifier",
    hyperliquid: "standalone x402-hl",
  },
  accepted: {
    scheme: paymentPayload.accepted.scheme,
    network: paymentPayload.accepted.network,
    amount: paymentPayload.accepted.amount,
    asset: paymentPayload.accepted.asset,
  },
  paymentIdentifier: {
    key: PAYMENT_IDENTIFIER,
    required: true,
    id,
  },
  hyperliquidPayload: {
    action: exactPayload.action?.type,
    chain: exactPayload.action?.hyperliquidChain,
    destination: exactPayload.action?.destination,
    token: exactPayload.action?.token,
    amount: exactPayload.action?.amount,
    signer: exactPayload.user,
  },
  paymentHeaderNames: Object.keys(headers),
}, null, 2));
