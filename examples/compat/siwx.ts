import { x402Client, x402HTTPClient } from "@x402/core/client";
import { encodePaymentRequiredHeader } from "@x402/core/http";
import type { PaymentRequired, PaymentRequirements } from "@x402/core/types";
import {
  InMemorySIWxStorage,
  SIGN_IN_WITH_X,
  createSIWxClientExtension,
  createSIWxPayload,
  createSIWxResourceServerExtension,
  declareSIWxExtension,
  encodeSIWxHeader,
  validateSIWxMessage,
  verifySIWxSignature,
  wrapFetchWithSIWx,
} from "@x402/extensions/sign-in-with-x";
import { ExactHyperliquidScheme as ExactHyperliquidClient } from "x402-hl/exact/client";
import { ExactHyperliquidScheme as ExactHyperliquidServer } from "x402-hl/exact/server";
import { privateKeyToAccount } from "viem/accounts";

const HYPERLIQUID_TESTNET = "hyperliquid:testnet" as const;
const EIP155_ARBITRUM = "eip155:42161" as const;
const RESOURCE_URL = "https://demo.peezy.test/x402/api/paid";
const RESOURCE_PATH = new URL(RESOURCE_URL).pathname;
const PRIVATE_KEY = "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const account = privateKeyToAccount(PRIVATE_KEY);
const paymentRequirement: PaymentRequirements = {
  scheme: "exact",
  network: HYPERLIQUID_TESTNET,
  amount: "1",
  asset: "USDC:0xeb62eee3685fc4c43992febcd9e75443",
  payTo: "0x000000000000000000000000000000000000dEaD",
  maxTimeoutSeconds: 300,
  extra: {
    decimals: 6,
    signatureChainId: "0xa4b1",
    tokenSymbol: "USDC",
  },
};

type SIWxWireExtension = {
  info: {
    domain: string;
    uri: string;
    statement?: string;
    version: string;
    nonce: string;
    issuedAt: string;
    expirationTime?: string;
    notBefore?: string;
    requestId?: string;
    resources?: string[];
  };
  supportedChains: Array<{
    chainId: string;
    type: "eip191" | "ed25519";
    signatureScheme?: "eip191" | "eip1271" | "eip6492" | "siws";
  }>;
  schema: unknown;
};

type ProbeResult = {
  directHyperliquid: {
    supportedChains: SIWxWireExtension["supportedChains"];
    createPayload: "failed";
    error: string;
    httpClientHeader: boolean;
    wrapFetchResult: "throws";
  };
  explicitEip155Auth: {
    paymentNetwork: string;
    authNetwork: string;
    supportedChains: SIWxWireExtension["supportedChains"];
    signatureValid: boolean;
    messageValid: boolean;
    protectedRequestGrant: boolean;
    httpClientHeader: boolean;
    wrapFetchRetries: boolean;
  };
  x402HlComposition: {
    clientScheme: string;
    serverScheme: string;
  };
  conclusion: string;
};

const hyperliquidClientScheme = new ExactHyperliquidClient(account);
const hyperliquidServerScheme = new ExactHyperliquidServer();
const paymentClient = new x402Client()
  .register(HYPERLIQUID_TESTNET, hyperliquidClientScheme)
  .registerExtension(createSIWxClientExtension({ signers: [account] }));
const httpPaymentClient = new x402HTTPClient(paymentClient);

const direct = await enrichSIWxDeclaration({ statement: "Direct Hyperliquid SIWX probe" });
const directPayloadError = await captureError(() =>
  createSIWxPayload(
    {
      ...direct.info,
      chainId: direct.supportedChains[0]?.chainId ?? HYPERLIQUID_TESTNET,
      type: direct.supportedChains[0]?.type ?? "eip191",
    },
    account,
  ),
);
assertIncludes(directPayloadError, "Unsupported chain namespace: hyperliquid:testnet");

const directPaymentRequired = makePaymentRequired(direct);
const directHeaders = await httpPaymentClient.handlePaymentRequired(directPaymentRequired);
const directWrapError = await captureError(() =>
  wrapFetchWithSIWx(mock402Fetch(directPaymentRequired), account)("https://demo.peezy.test/x402/api/paid"),
);
assertIncludes(directWrapError, "Unsupported chain namespace: hyperliquid:testnet");

const explicit = await enrichSIWxDeclaration({
  network: EIP155_ARBITRUM,
  statement: "Authenticate the injected EVM wallet that paid on Hyperliquid",
});
const explicitChain = explicit.supportedChains[0];
assertEqual(explicitChain.chainId, EIP155_ARBITRUM, "explicit SIWX auth chain");
assertEqual(explicitChain.type, "eip191", "explicit SIWX auth signature type");

const explicitPayload = await createSIWxPayload(
  {
    ...explicit.info,
    chainId: explicitChain.chainId,
    type: explicitChain.type,
  },
  account,
);
const messageValidation = await validateSIWxMessage(explicitPayload, RESOURCE_URL);
const signatureVerification = await verifySIWxSignature(explicitPayload);
assertEqual(messageValidation.valid, true, "explicit SIWX message validation");
assertEqual(signatureVerification.valid, true, "explicit SIWX signature verification");

const storage = new InMemorySIWxStorage();
storage.recordPayment(RESOURCE_PATH, account.address);
const resourceExtension = createSIWxResourceServerExtension({ storage });
const protectedRequestResult = await resourceExtension.transportHooks?.http?.onProtectedRequest?.(
  directDeclarationFor(EIP155_ARBITRUM),
  {
    path: RESOURCE_PATH,
    adapter: {
      getHeader: (name: string) =>
        name.toLowerCase() === SIGN_IN_WITH_X ? encodeSIWxHeader(explicitPayload) : null,
      getUrl: () => RESOURCE_URL,
    },
  } as any,
  {
    accepts: paymentRequirement,
    extensions: directDeclarationFor(EIP155_ARBITRUM),
  } as any,
);
const protectedRequestGranted = Boolean(
  protectedRequestResult && "grantAccess" in protectedRequestResult && protectedRequestResult.grantAccess,
);
assertEqual(protectedRequestGranted, true, "explicit SIWX protected request grant");

const explicitPaymentRequired = makePaymentRequired(explicit);
const explicitHeaders = await httpPaymentClient.handlePaymentRequired(explicitPaymentRequired);
assertEqual(Boolean(explicitHeaders?.[SIGN_IN_WITH_X]), true, "explicit SIWX x402HTTPClient header");

let explicitWrapRetries = 0;
await wrapFetchWithSIWx(async () => {
  explicitWrapRetries += 1;
  return new Response(null, {
    status: 402,
    headers: { "PAYMENT-REQUIRED": encodePaymentRequiredHeader(explicitPaymentRequired) },
  });
}, account)("https://demo.peezy.test/x402/api/paid");

const result: ProbeResult = {
  directHyperliquid: {
    supportedChains: direct.supportedChains,
    createPayload: "failed",
    error: directPayloadError,
    httpClientHeader: Boolean(directHeaders?.[SIGN_IN_WITH_X]),
    wrapFetchResult: "throws",
  },
  explicitEip155Auth: {
    paymentNetwork: paymentRequirement.network,
    authNetwork: EIP155_ARBITRUM,
    supportedChains: explicit.supportedChains,
    signatureValid: signatureVerification.valid,
    messageValid: messageValidation.valid,
    protectedRequestGrant: protectedRequestGranted,
    httpClientHeader: Boolean(explicitHeaders?.[SIGN_IN_WITH_X]),
    wrapFetchRetries: explicitWrapRetries > 1,
  },
  x402HlComposition: {
    clientScheme: hyperliquidClientScheme.scheme,
    serverScheme: hyperliquidServerScheme.scheme,
  },
  conclusion:
    "SIWX EVM auth does not work when the SIWX auth chain is hyperliquid:testnet. Keep payment accepts on hyperliquid:testnet, but declare SIWX auth metadata on an EIP-155 chain such as eip155:42161.",
};

console.log(JSON.stringify(result, null, 2));

async function enrichSIWxDeclaration(options: Parameters<typeof declareSIWxExtension>[0]): Promise<SIWxWireExtension> {
  const declaration = directDeclarationFor(options?.network, options?.statement);
  const extension = createSIWxResourceServerExtension({ storage: new InMemorySIWxStorage() });
  const enriched = await extension.enrichPaymentRequiredResponse?.(declaration[SIGN_IN_WITH_X], {
    requirements: [paymentRequirement],
    resourceInfo: {
      url: RESOURCE_URL,
      description: "SIWX compatibility probe",
      mimeType: "application/json",
    },
    error: undefined,
    paymentRequiredResponse: makePaymentRequired(declaration[SIGN_IN_WITH_X] as SIWxWireExtension),
    transportContext: undefined,
  } as any);

  if (!enriched || typeof enriched !== "object") {
    throw new Error("SIWX enrichment did not return an extension payload");
  }

  return enriched as SIWxWireExtension;
}

function directDeclarationFor(network?: string | string[], statement?: string): Record<string, unknown> {
  return declareSIWxExtension({
    network,
    resourceUri: RESOURCE_URL,
    statement,
    expirationSeconds: 300,
  });
}

function makePaymentRequired(extension: SIWxWireExtension | unknown): PaymentRequired {
  return {
    x402Version: 2,
    resource: {
      url: RESOURCE_URL,
      description: "SIWX compatibility probe",
      mimeType: "application/json",
    },
    accepts: [paymentRequirement],
    extensions: {
      [SIGN_IN_WITH_X]: extension,
    },
  };
}

function mock402Fetch(paymentRequired: PaymentRequired): typeof fetch {
  return async () =>
    new Response(null, {
      status: 402,
      headers: { "PAYMENT-REQUIRED": encodePaymentRequiredHeader(paymentRequired) },
    });
}

async function captureError(operation: () => Promise<unknown>): Promise<string> {
  try {
    await operation();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("Expected operation to throw");
}

function assertIncludes(value: string, expected: string): void {
  if (!value.includes(expected)) {
    throw new Error(`Expected "${value}" to include "${expected}"`);
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}
