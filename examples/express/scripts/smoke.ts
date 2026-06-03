import { x402HTTPClient } from "@x402/core/client";
import { x402Client } from "@x402/core/client";
import { config, HYPERLIQUID_TESTNET } from "../src/config.js";

const baseUrl = `http://${config.host}:${config.port}`;

async function assertStatus(path: string, expected: number): Promise<Response> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Accept: "application/json",
    },
  });
  if (response.status !== expected) {
    throw new Error(`${path} returned ${response.status}, expected ${expected}`);
  }
  return response;
}

const page = await assertStatus(config.basePath, 200);
const challenge = await assertStatus(`${config.basePath}/api/paid`, 402);
const paywall = await fetch(`${baseUrl}${config.basePath}/api/paid`, {
  headers: {
    Accept: "text/html",
    "User-Agent": "Mozilla/5.0 x402-hl-express-smoke",
  },
});

if (paywall.status !== 402) {
  throw new Error(`${config.basePath}/api/paid paywall returned ${paywall.status}, expected 402`);
}

const paywallHtml = await paywall.text();
if (!paywallHtml.includes("Hyperliquid Payment Required") || !paywallHtml.includes("Connect wallet")) {
  throw new Error("HTML paywall did not include the Hyperliquid injected-wallet UI");
}

const paymentRequired = new x402HTTPClient(new x402Client()).getPaymentRequiredResponse(
  name => challenge.headers.get(name),
  await challenge.json(),
);
const acceptsHyperliquid = paymentRequired.accepts.some(
  requirement => requirement.network === HYPERLIQUID_TESTNET && requirement.scheme === "exact",
);

if (!acceptsHyperliquid) {
  throw new Error("402 challenge did not advertise exact hyperliquid:testnet");
}

console.log(JSON.stringify({
  ok: true,
  pageStatus: page.status,
  protectedStatus: challenge.status,
  paywallStatus: paywall.status,
  x402Version: paymentRequired.x402Version,
}, null, 2));
