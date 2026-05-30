import { x402Client } from "@x402/core/client";
import { encodePaymentResponseHeader } from "@x402/core/http";
import { x402ResourceServer } from "@x402/core/server";
import type { FacilitatorClient } from "@x402/core/server";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  SupportedResponse,
  VerifyResponse,
} from "@x402/core/types";
import {
  createEIP712OfferReceiptIssuer,
  createOfferReceiptExtension,
  decodeSignedOffers,
  declareOfferReceiptExtension,
  extractReceiptFromResponse,
  extractReceiptPayload,
  extractOffersFromPaymentRequired,
  findAcceptsObjectFromSignedOffer,
  isEIP712SignedOffer,
  isEIP712SignedReceipt,
  verifyOfferSignatureEIP712,
  verifyReceiptMatchesOffer,
  verifyReceiptSignatureEIP712,
} from "@x402/extensions/offer-receipt";
import { privateKeyToAccount } from "viem/accounts";
import { ExactHyperliquidScheme as ExactHyperliquidClient } from "x402-hl/exact/client";
import { ExactHyperliquidScheme as ExactHyperliquidFacilitator } from "x402-hl/exact/facilitator";
import { ExactHyperliquidScheme as ExactHyperliquidServer } from "x402-hl/exact/server";

const HYPERLIQUID_TESTNET = "hyperliquid:testnet";

// Test-only fallbacks keep this smoke runnable without secrets; set the env vars below
// to exercise the same composition with operator-controlled local keys.
const TEST_ONLY_OFFER_RECEIPT_SIGNER_PRIVATE_KEY =
  "0x59c6995e998f97a5a004497e5da1a7f4a4b3b2d77e08c144f2e91dcdb86d75d6" as const;
const TEST_ONLY_PAYER_PRIVATE_KEY =
  "0x8b3a350cf5c34c9194ca3a545d19876aac9a4355b1e41e73a8f0ca461d5f5779" as const;
const TEST_ONLY_PAY_TO = "0x0000000000000000000000000000000000004020" as const;
const TEST_ONLY_TRANSACTION =
  "0x1111111111111111111111111111111111111111111111111111111111111111" as const;

class CompatibilityFacilitator implements FacilitatorClient {
  constructor(private readonly exact: ExactHyperliquidFacilitator) {}

  async verify(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    return this.exact.verify(paymentPayload, paymentRequirements);
  }

  async settle(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    const verifyResult = await this.verify(paymentPayload, paymentRequirements);
    if (!verifyResult.isValid) {
      return {
        success: false,
        errorReason: verifyResult.invalidReason,
        errorMessage: verifyResult.invalidMessage,
        transaction: "",
        network: paymentRequirements.network,
        payer: verifyResult.payer,
      };
    }
    return {
      success: true,
      transaction: TEST_ONLY_TRANSACTION,
      network: paymentRequirements.network,
      payer: verifyResult.payer,
    };
  }

  async getSupported(): Promise<SupportedResponse> {
    return {
      kinds: [
        {
          x402Version: 2,
          scheme: "exact",
          network: HYPERLIQUID_TESTNET,
        },
      ],
      extensions: [],
      signers: {},
    };
  }
}

const offerReceiptSigner = privateKeyToAccount(
  privateKeyFromEnv("OFFER_RECEIPT_SIGNER_PRIVATE_KEY", TEST_ONLY_OFFER_RECEIPT_SIGNER_PRIVATE_KEY),
);
const payer = privateKeyToAccount(
  privateKeyFromEnv("HYPERLIQUID_PAYER_PRIVATE_KEY", TEST_ONLY_PAYER_PRIVATE_KEY),
);
const payTo = addressFromEnv("HYPERLIQUID_PAY_TO_ADDRESS", TEST_ONLY_PAY_TO);

const offerReceiptExtensionDeclaration = () =>
  declareOfferReceiptExtension({
    includeTxHash: true,
    offerValiditySeconds: 120,
  });
const resourceUrl = "https://example.test/x402/offer-receipt-compat";
const transportContext = {
  request: {
    adapter: {
      getUrl: () => resourceUrl,
    },
  },
};

const offerReceiptIssuer = createEIP712OfferReceiptIssuer(
  `did:pkh:eip155:42161:${offerReceiptSigner.address}`,
  params => offerReceiptSigner.signTypedData(params),
);
const exactServer = new ExactHyperliquidServer();
const exactFacilitator = new ExactHyperliquidFacilitator();
const facilitator = new CompatibilityFacilitator(exactFacilitator);
const resourceServer = new x402ResourceServer(facilitator)
  .register(HYPERLIQUID_TESTNET, exactServer)
  .registerExtension(createOfferReceiptExtension(offerReceiptIssuer));

const paymentRequirements = await buildExactHyperliquidRequirements();
const paymentRequired = await resourceServer.createPaymentRequiredResponse(
  [paymentRequirements],
  {
    url: resourceUrl,
    description: "x402-hl offer-receipt compatibility smoke",
    mimeType: "application/json",
  },
  undefined,
  offerReceiptExtensionDeclaration(),
  transportContext,
);

const signedOffers = extractOffersFromPaymentRequired(paymentRequired);
if (signedOffers.length !== 1) {
  throw new Error(`Expected one signed offer, got ${signedOffers.length}`);
}

const [decodedOffer] = decodeSignedOffers(signedOffers);
const matchedRequirements = findAcceptsObjectFromSignedOffer(decodedOffer, paymentRequired.accepts);
if (!matchedRequirements) {
  throw new Error("Signed offer did not match any x402-hl payment requirement");
}
if (!isEIP712SignedOffer(decodedOffer.signedOffer)) {
  throw new Error(`Expected an EIP-712 signed offer, got ${decodedOffer.signedOffer.format}`);
}

const verifiedOffer = await verifyOfferSignatureEIP712(decodedOffer.signedOffer);
if (verifiedOffer.signer.toLowerCase() !== offerReceiptSigner.address.toLowerCase()) {
  throw new Error("Offer signature did not recover the configured offer-receipt signer");
}

const client = new x402Client().register(
  HYPERLIQUID_TESTNET,
  new ExactHyperliquidClient(payer),
);
const paymentPayload = await client.createPaymentPayload(paymentRequired);
const verifyResult = await resourceServer.verifyPayment(
  paymentPayload,
  matchedRequirements,
  offerReceiptExtensionDeclaration(),
  transportContext,
);
if (!verifyResult.isValid) {
  throw new Error(`x402-hl facilitator rejected the payment payload: ${verifyResult.invalidReason}`);
}

const settlement = await resourceServer.settlePayment(
  paymentPayload,
  matchedRequirements,
  offerReceiptExtensionDeclaration(),
  transportContext,
);
if (!settlement.success) {
  throw new Error(`Compatibility settlement failed: ${settlement.errorReason}`);
}

const receipt = extractReceiptFromResponse(
  new Response("{}", {
    headers: {
      "PAYMENT-RESPONSE": encodePaymentResponseHeader(settlement),
    },
  }),
);
if (!receipt) {
  throw new Error("No offer-receipt receipt was present in the settlement response");
}
if (!verifyReceiptMatchesOffer(receipt, decodedOffer, [payer.address])) {
  throw new Error("Signed receipt did not match the selected signed offer and payer");
}
if (!isEIP712SignedReceipt(receipt)) {
  throw new Error(`Expected an EIP-712 signed receipt, got ${receipt.format}`);
}
const verifiedReceipt = await verifyReceiptSignatureEIP712(receipt);
if (verifiedReceipt.signer.toLowerCase() !== offerReceiptSigner.address.toLowerCase()) {
  throw new Error("Receipt signature did not recover the configured offer-receipt signer");
}

const receiptPayload = extractReceiptPayload(receipt);
if (receiptPayload.transaction !== TEST_ONLY_TRANSACTION) {
  throw new Error("Signed receipt did not preserve the settlement transaction hash");
}
console.log(JSON.stringify({
  ok: true,
  payment: {
    scheme: matchedRequirements.scheme,
    network: matchedRequirements.network,
    asset: matchedRequirements.asset,
    amount: matchedRequirements.amount,
    payTo: matchedRequirements.payTo,
    payer: verifyResult.payer,
  },
  offerReceipt: {
    format: decodedOffer.format,
    offerSigner: verifiedOffer.signer,
    receiptSigner: verifiedReceipt.signer,
    receiptTransaction: receiptPayload.transaction,
  },
  packageGraph: {
    x402Hl: "local package import",
    extensions: "@x402/extensions/offer-receipt@2.14.0",
  },
}, null, 2));

async function buildExactHyperliquidRequirements(): Promise<PaymentRequirements> {
  const amount = await exactServer.parsePrice("$0.000001", HYPERLIQUID_TESTNET);
  return exactServer.enhancePaymentRequirements(
    {
      scheme: "exact",
      network: HYPERLIQUID_TESTNET,
      asset: amount.asset,
      amount: amount.amount,
      payTo,
      maxTimeoutSeconds: 300,
      extra: amount.extra ?? {},
    },
    {
      x402Version: 2,
      scheme: "exact",
      network: HYPERLIQUID_TESTNET,
    },
    [],
  );
}

function privateKeyFromEnv(name: string, fallback: `0x${string}`): `0x${string}` {
  const value = process.env[name]?.trim() || fallback;
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${name} must be a 32-byte 0x-prefixed private key`);
  }
  return value as `0x${string}`;
}

function addressFromEnv(name: string, fallback: `0x${string}`): `0x${string}` {
  const value = process.env[name]?.trim() || fallback;
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${name} must be a 20-byte 0x-prefixed address`);
  }
  return value as `0x${string}`;
}
