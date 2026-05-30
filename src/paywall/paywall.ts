import type { PaymentRequired } from "@x402/paywall";
import { getHyperliquidTemplate } from "./template-loader";

interface PaywallHtmlOptions {
  amount: number;
  paymentRequired: PaymentRequired;
  currentUrl: string;
  testnet: boolean;
  appName?: string;
  appLogo?: string;
}

function escapeString(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

export function getHyperliquidPaywallHtml(options: PaywallHtmlOptions): string {
  const HYPERLIQUID_PAYWALL_TEMPLATE = getHyperliquidTemplate();

  if (!HYPERLIQUID_PAYWALL_TEMPLATE) {
    return getFallbackHyperliquidPaywallHtml(options);
  }

  const { amount, paymentRequired, currentUrl, testnet, appName, appLogo } = options;

  const logOnTestnet = testnet
    ? "console.log('Hyperliquid payment required initialized:', window.x402);"
    : "";

  const configScript = `
  <script>
    window.x402 = {
      amount: ${amount},
      paymentRequired: ${JSON.stringify(paymentRequired)},
      testnet: ${testnet},
      currentUrl: "${escapeString(currentUrl)}",
      config: {
        chainConfig: {},
      },
      appName: "${escapeString(appName || "")}",
      appLogo: "${escapeString(appLogo || "")}",
    };
    ${logOnTestnet}
  </script>`;

  return HYPERLIQUID_PAYWALL_TEMPLATE.replace("</head>", `${configScript}\n</head>`);
}

export function getFallbackHyperliquidPaywallHtml(options: PaywallHtmlOptions): string {
  const { amount, paymentRequired, testnet, appName, appLogo } = options;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Required</title>
  <style>
    *, *:before, *:after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      background-color: #f9fafb;
      font-family: Inter, system-ui, -apple-system, sans-serif;
      min-height: 100vh;
    }
    .container {
      max-width: 32rem;
      margin: 4rem auto;
      padding: 1.5rem;
      background-color: white;
      border-radius: 0.75rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    }
    .header { display: flex; flex-direction: column; gap: 1rem; }
    .title { font-size: 1.5rem; font-weight: 700; color: #111827; margin-bottom: 0.5rem; }
    .subtitle { color: #4b5563; }
    .logo { width: 3rem; height: 3rem; border-radius: 0.5rem; object-fit: cover; }
    .content { display: flex; flex-direction: column; gap: 1rem; width: 100%; }
    .details {
      background-color: #f9fafb;
      border-radius: 0.5rem;
      padding: 1rem;
      text-align: left;
    }
    .detail-row { display: flex; justify-content: space-between; margin-bottom: 0.5rem; }
    .detail-label { color: #4b5563; font-size: 0.9rem; }
    .detail-value { color: #111827; font-weight: 600; font-size: 0.9rem; }
    .amount { font-size: 2rem; font-weight: 700; color: #111827; }
    .button {
      width: 100%;
      padding: 0.75rem 1rem;
      border-radius: 0.5rem;
      font-weight: 600;
      border: none;
      cursor: pointer;
      transition: background-color 0.15s;
    }
    .button-primary { background-color: #2563eb; color: white; }
    .button-primary:hover { background-color: #1d4ed8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      ${appLogo ? `<img src="${appLogo}" alt="${appName || "App"} Logo" class="logo">` : ""}
      <div class="title">Payment Required</div>
      <div class="subtitle">${appName || "This resource"} requires a payment of ${amount} USDC</div>
    </div>
    <div class="content">
      <div class="details">
        <div class="detail-row">
          <span class="detail-label">Network</span>
          <span class="detail-value">${testnet ? "Hyperliquid Testnet" : "Hyperliquid Mainnet"}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Amount</span>
          <span class="detail-value">${amount} USDC</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">x402 Version</span>
          <span class="detail-value">${paymentRequired.x402Version}</span>
        </div>
      </div>
      <div class="amount">${amount} USDC</div>
      <p style="color: #6b7280; font-size: 0.9rem;">
        Please complete the payment using your Hyperliquid wallet to access this resource.
      </p>
    </div>
  </div>
</body>
</html>`;
}
