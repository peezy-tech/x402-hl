import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactHyperliquidScheme } from "x402-hl/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { HYPERLIQUID_TESTNET } from "./config.js";

export function buildPaymentClient(privateKey: `0x${string}`): x402Client {
  const account = privateKeyToAccount(privateKey);
  return new x402Client().register(HYPERLIQUID_TESTNET, new ExactHyperliquidScheme(account));
}

export async function fetchWithHyperliquidPayment(
  url: string,
  privateKey: `0x${string}`,
): Promise<Response> {
  const paidFetch = wrapFetchWithPayment(fetch, buildPaymentClient(privateKey));
  return paidFetch(url, {
    headers: {
      Accept: "application/json",
    },
  });
}
