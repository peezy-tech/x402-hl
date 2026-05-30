import { z } from "zod";

export const HyperliquidTokenIdRegex = /^[A-Za-z0-9]+:0x[0-9a-fA-F]{32,40}$/;
const EvmSignatureRegex = /^0x[0-9a-fA-F]+$/;
const EvmAddressRegex = /^0x[0-9a-fA-F]{40}$/;

export const ExactHyperliquidPayloadSchema = z.object({
  action: z.record(z.any()),
  signature: z.union([
    z.string().regex(EvmSignatureRegex),
    z.object({
      r: z.string().regex(EvmSignatureRegex),
      s: z.string().regex(EvmSignatureRegex),
      v: z.number().int(),
    }),
  ]),
  nonce: z.number().int().positive(),
  user: z.string().regex(EvmAddressRegex),
});

export type ExactHyperliquidPayload = z.infer<typeof ExactHyperliquidPayloadSchema>;

export const HyperliquidErrorReasons = [
  "invalid_x402_version",
  "unsupported_scheme",
  "network_mismatch",
  "invalid_exact_hl_payload",
  "invalid_exact_hl_payload_signature",
  "invalid_exact_hl_payload_asset_mismatch",
  "invalid_exact_hl_payload_recipient_mismatch",
  "invalid_exact_hl_payload_amount_mismatch",
  "invalid_exact_hl_network",
  "hl_exchange_error",
  "hl_tx_not_found",
  "hl_tx_unconfirmed",
] as const;
