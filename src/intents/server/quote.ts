import type { Price } from "@x402/core/types";
import type { RouteConfig } from "@x402/core/server";
import type { Hex } from "viem";
import {
  HyperEvmExecutionIntent,
  HyperEvmExecutionIntentInput,
  IntentDeclaration,
  IntentPaymentExtra,
  X402_HL_INTENTS_EXTENSION,
  X402_HL_INTENTS_EXTRA_KEY,
} from "../types";
import { createIntentDeclaration } from "../extension";
import { createIntentPaymentExtra } from "../payment";
import { normalizeExecutionIntent } from "../typed-data";

export interface IntentQuoteInput {
  id: string;
  intent: HyperEvmExecutionIntentInput;
  price: Price;
  network: `${string}:${string}`;
  payTo: string;
  maxTimeoutSeconds?: number;
  description?: string;
  mimeType?: string;
  serviceName?: string;
  tags?: string[];
  iconUrl?: string;
  extra?: Record<string, unknown>;
}

export interface ResolvedIntentQuote {
  id: string;
  intent: HyperEvmExecutionIntent;
  intentTemplateHash: Hex;
  declaration: IntentDeclaration;
  paymentExtra: IntentPaymentExtra;
  routeConfig: RouteConfig;
}

export function createIntentQuote(input: IntentQuoteInput): ResolvedIntentQuote {
  if (input.intent.quoteId !== undefined && input.intent.quoteId !== input.id) {
    throw new Error("Intent quoteId must match the quote id");
  }

  const intent = normalizeExecutionIntent({
    ...input.intent,
    quoteId: input.id,
  });
  const declaration = createIntentDeclaration(intent);
  const paymentExtra = createIntentPaymentExtra(
    intent,
    declaration.intentTemplateHash as Hex,
  );

  const routeConfig: RouteConfig = {
    accepts: {
      scheme: "exact",
      network: input.network,
      price: input.price,
      payTo: input.payTo,
      maxTimeoutSeconds: input.maxTimeoutSeconds,
      extra: {
        ...(input.extra ?? {}),
        [X402_HL_INTENTS_EXTRA_KEY]: paymentExtra,
      },
    },
    description: input.description,
    mimeType: input.mimeType ?? "application/json",
    serviceName: input.serviceName,
    tags: input.tags,
    iconUrl: input.iconUrl,
    extensions: {
      [X402_HL_INTENTS_EXTENSION]: declaration,
    },
  };

  return {
    id: input.id,
    intent,
    intentTemplateHash: declaration.intentTemplateHash as Hex,
    declaration,
    paymentExtra,
    routeConfig,
  };
}
