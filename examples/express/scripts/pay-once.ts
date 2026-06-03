import { x402HTTPClient } from "@x402/core/client";
import { x402Client } from "@x402/core/client";
import { config } from "../src/config.js";
import { fetchWithHyperliquidPayment } from "../src/pay.js";

if (!config.payerPrivateKey) {
  throw new Error("HYPERLIQUID_PAYER_PRIVATE_KEY is required for `pnpm pay`");
}

const url = `http://${config.host}:${config.port}${config.basePath}/api/paid`;
const response = await fetchWithHyperliquidPayment(url, config.payerPrivateKey);
const body = await response.text();
const paymentResponse = response.headers.get("PAYMENT-RESPONSE");
const decodedPaymentResponse = paymentResponse
  ? new x402HTTPClient(new x402Client()).getPaymentSettleResponse(name =>
      name === "PAYMENT-RESPONSE" ? paymentResponse : null,
    )
  : null;

console.log(JSON.stringify({
  ok: response.ok,
  status: response.status,
  paymentResponse: decodedPaymentResponse,
  body: tryJson(body),
}, null, 2));

function tryJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
