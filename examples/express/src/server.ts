import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { createPaywall } from "@x402/paywall";
import { ExactHyperliquidScheme as ExactHyperliquidServer } from "x402-hl/exact/server";
import { hyperliquidPaywall } from "x402-hl/paywall";
import { config, HYPERLIQUID_TESTNET } from "./config.js";
import { LocalHyperliquidFacilitatorClient } from "./facilitator.js";
import { fetchWithHyperliquidPayment } from "./pay.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json());

const protectedPath = `${config.basePath}/api/paid`;
const resourceServer = new x402ResourceServer(new LocalHyperliquidFacilitatorClient()).register(
  HYPERLIQUID_TESTNET,
  new ExactHyperliquidServer(),
);
const browserPaywall = createPaywall().withNetwork(hyperliquidPaywall).build();

app.get(config.basePath, (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>x402-hl Express Example</title></head>
  <body>
    <main>
      <h1>x402-hl Express Example</h1>
      <p>Accepting <code>exact</code> payments on <code>${HYPERLIQUID_TESTNET}</code>.</p>
      <ul>
        <li>Price: <code>$${config.priceUsd}</code></li>
        <li>Recipient: <code>${config.payTo}</code></li>
      </ul>
      <p><a href="${protectedPath}">Open wallet paywall</a></p>
    </main>
  </body>
</html>`);
});

app.use(
  paymentMiddleware(
    {
      [`GET ${protectedPath}`]: {
        accepts: {
          scheme: "exact",
          network: HYPERLIQUID_TESTNET,
          price: `$${config.priceUsd}`,
          payTo: config.payTo,
          maxTimeoutSeconds: 300,
        },
        description: "x402-hl Express example payload",
        mimeType: "application/json",
      },
    },
    resourceServer,
    {
      appName: "x402-hl Express Example",
      testnet: true,
    },
    browserPaywall,
  ),
);

app.get(protectedPath, (_req, res) => {
  res.json({
    ok: true,
    paid: true,
    message: "Hyperliquid testnet x402 payment accepted.",
    servedAt: new Date().toISOString(),
  });
});

app.post(`${config.basePath}/api/pay-once`, async (_req, res, next) => {
  try {
    if (!config.payerPrivateKey) {
      res.status(503).json({
        ok: false,
        error: "HYPERLIQUID_PAYER_PRIVATE_KEY is not configured.",
      });
      return;
    }

    const response = await fetchWithHyperliquidPayment(
      `http://${config.host}:${config.port}${protectedPath}`,
      config.payerPrivateKey,
    );
    const paymentResponse = response.headers.get("PAYMENT-RESPONSE");
    if (paymentResponse) res.setHeader("PAYMENT-RESPONSE", paymentResponse);
    res.status(response.status).type(response.headers.get("content-type") || "application/json");
    res.send(await response.text());
  } catch (error) {
    next(error);
  }
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  res.status(500).json({ ok: false, error: message });
});

app.listen(config.port, config.host, () => {
  console.log(`x402-hl example listening on http://${config.host}:${config.port}${config.basePath}`);
});
