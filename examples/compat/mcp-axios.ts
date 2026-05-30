import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import "dotenv/config";
import axios, { type AxiosInstance } from "axios";
import { x402Client, wrapAxiosWithPayment } from "@x402/axios";
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader } from "@x402/core/http";
import type { PaymentPayload, PaymentRequired } from "@x402/core/types";
import { HyperliquidNetworkConfigs, HYPERLIQUID_TESTNET, type ClientHyperliquidSigner } from "x402-hl";
import { registerExactHyperliquidScheme } from "x402-hl/exact/client";
import { privateKeyToAccount } from "viem/accounts";

type McpTextResult = {
  content: Array<{ type: "text"; text: string }>;
};

const DEFAULT_ENDPOINT_PATH = "/x402/api/paid";
const MOCK_PAYER = "0x1111111111111111111111111111111111111111";
const MOCK_PAY_TO = "0x000000000000000000000000000000000000dEaD";
const MOCK_SIGNATURE = `0x${"11".repeat(64)}1b` as `0x${string}`;

function createPaidApi(baseURL: string, signer: ClientHyperliquidSigner): AxiosInstance {
  const client = new x402Client();
  registerExactHyperliquidScheme(client, {
    signer,
    networks: [HYPERLIQUID_TESTNET],
  });

  return wrapAxiosWithPayment(axios.create({ baseURL }), client);
}

async function callPaidResourceTool(api: AxiosInstance, endpointPath: string): Promise<McpTextResult> {
  const response = await api.get(endpointPath, {
    headers: {
      Accept: "application/json",
    },
  });

  return {
    content: [{ type: "text", text: JSON.stringify(response.data) }],
  };
}

async function runRealCompat(): Promise<void> {
  const privateKey = process.env.HYPERLIQUID_MCP_PAYER_PRIVATE_KEY ?? process.env.HYPERLIQUID_PAYER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("Set HYPERLIQUID_MCP_PAYER_PRIVATE_KEY or HYPERLIQUID_PAYER_PRIVATE_KEY to run real MCP compatibility mode");
  }

  const baseURL = process.env.MCP_RESOURCE_SERVER_URL ?? process.env.RESOURCE_SERVER_URL ?? "http://127.0.0.1:4020";
  const endpointPath = process.env.MCP_ENDPOINT_PATH ?? process.env.ENDPOINT_PATH ?? DEFAULT_ENDPOINT_PATH;
  const api = createPaidApi(baseURL, privateKeyToAccount(privateKey as `0x${string}`));
  const result = await callPaidResourceTool(api, endpointPath);

  console.log(JSON.stringify({
    ok: true,
    mode: "real",
    baseURL,
    endpointPath,
    result,
  }, null, 2));
}

async function runMockCompat(): Promise<void> {
  const challenge = createHyperliquidChallenge();
  let paidPayload: PaymentPayload | undefined;
  let unpaidRequests = 0;
  let paidRequests = 0;

  const server = createServer((req, res) => {
    try {
      if (req.url !== "/paid") {
        res.writeHead(404).end();
        return;
      }

      const paymentHeader = readHeader(req, "payment-signature");
      if (!paymentHeader) {
        unpaidRequests += 1;
        writePaymentRequired(res, challenge);
        return;
      }

      paidRequests += 1;
      paidPayload = decodePaymentSignatureHeader(paymentHeader);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, paid: true }));
    } catch (error) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    }
  });

  await listen(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Mock server did not bind a TCP port");

  try {
    const api = createPaidApi(`http://127.0.0.1:${address.port}`, createMockSigner());
    const result = await callPaidResourceTool(api, "/paid");

    if (unpaidRequests !== 1 || paidRequests !== 1) {
      throw new Error(`Expected one unpaid request and one paid retry, got unpaid=${unpaidRequests} paid=${paidRequests}`);
    }
    assertHyperliquidPayment(paidPayload);

    console.log(JSON.stringify({
      ok: true,
      mode: "mock",
      mcpShape: result,
      paidPayload: summarizePayment(paidPayload),
      note: "Mock mode proves @x402/axios can retry an MCP-style tool request with an x402-hl Hyperliquid payment header; it does not settle on Hyperliquid.",
    }, null, 2));
  } finally {
    await close(server);
  }
}

function createHyperliquidChallenge(): PaymentRequired {
  const config = HyperliquidNetworkConfigs[HYPERLIQUID_TESTNET];

  return {
    x402Version: 2,
    resource: {
      url: "mcp://tool/get-hyperliquid-paid-data",
      description: "Mock MCP tool protected by a Hyperliquid x402 requirement",
      mimeType: "application/json",
    },
    accepts: [{
      scheme: "exact",
      network: HYPERLIQUID_TESTNET,
      amount: "1",
      asset: config.token,
      payTo: MOCK_PAY_TO,
      maxTimeoutSeconds: 300,
      extra: {
        decimals: config.decimals,
        tokenSymbol: "USDC",
        signatureChainId: config.signatureChainId,
      },
    }],
  };
}

function createMockSigner(): ClientHyperliquidSigner {
  return {
    address: MOCK_PAYER,
    signTypedData: async (_params: unknown) => MOCK_SIGNATURE,
  } as unknown as ClientHyperliquidSigner;
}

function assertHyperliquidPayment(payment: PaymentPayload | undefined): asserts payment is PaymentPayload {
  if (!payment) throw new Error("No payment payload captured");
  if (payment.x402Version !== 2) throw new Error(`Expected x402 v2 payload, got v${payment.x402Version}`);
  if (payment.accepted.scheme !== "exact") throw new Error(`Expected exact scheme, got ${payment.accepted.scheme}`);
  if (payment.accepted.network !== HYPERLIQUID_TESTNET) {
    throw new Error(`Expected ${HYPERLIQUID_TESTNET}, got ${payment.accepted.network}`);
  }

  const payload = payment.payload as { action?: { type?: string; destination?: string }; user?: string };
  if (payload.user !== MOCK_PAYER) throw new Error(`Expected payer ${MOCK_PAYER}, got ${payload.user}`);
  if (payload.action?.type !== "spotSend") throw new Error(`Expected Hyperliquid spotSend action, got ${payload.action?.type}`);
  if (payload.action.destination?.toLowerCase() !== MOCK_PAY_TO.toLowerCase()) {
    throw new Error(`Expected destination ${MOCK_PAY_TO}, got ${payload.action.destination}`);
  }
}

function summarizePayment(payment: PaymentPayload): unknown {
  const payload = payment.payload as { action?: { type?: string; token?: string; amount?: string }; user?: string };
  return {
    x402Version: payment.x402Version,
    scheme: payment.accepted.scheme,
    network: payment.accepted.network,
    asset: payment.accepted.asset,
    amount: payment.accepted.amount,
    actionType: payload.action?.type,
    actionToken: payload.action?.token,
    actionAmount: payload.action?.amount,
    payer: payload.user,
  };
}

function readHeader(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function writePaymentRequired(res: ServerResponse, paymentRequired: PaymentRequired): void {
  res.writeHead(402, {
    "content-type": "application/json",
    "PAYMENT-REQUIRED": encodePaymentRequiredHeader(paymentRequired),
  });
  res.end(JSON.stringify(paymentRequired));
}

function listen(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function close(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}

const mode = process.argv.includes("--real") ? "real" : "mock";

if (mode === "real") {
  await runRealCompat();
} else {
  await runMockCompat();
}
