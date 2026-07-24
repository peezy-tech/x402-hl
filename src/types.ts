import { z } from "zod";

export const HyperliquidTokenIdRegex = /^[A-Za-z0-9]+:0x[0-9a-fA-F]{32,40}$/;
const Bytes32Regex = /^0x[0-9a-fA-F]{64}$/;
const EvmAddressRegex = /^0x[0-9a-fA-F]{40}$/;
const HexIntegerRegex = /^0x[0-9a-fA-F]+$/;
const DecimalAmountRegex = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

export const ExactHyperliquidPayloadSchema = z.object({
  action: z
    .object({
      type: z.literal("sendAsset"),
      signatureChainId: z.string().regex(HexIntegerRegex),
      hyperliquidChain: z.enum(["Mainnet", "Testnet"]),
      destination: z.string().regex(EvmAddressRegex),
      sourceDex: z.literal("spot"),
      destinationDex: z.literal("spot"),
      token: z.string().regex(HyperliquidTokenIdRegex),
      amount: z.string().regex(DecimalAmountRegex),
      fromSubAccount: z.literal(""),
      nonce: z.number().int().nonnegative().safe(),
    })
    .strict(),
  signature: z
    .object({
      r: z.string().regex(Bytes32Regex),
      s: z.string().regex(Bytes32Regex),
      v: z.union([z.literal(27), z.literal(28)]),
    })
    .strict(),
  nonce: z.number().int().nonnegative().safe(),
  user: z.string().regex(EvmAddressRegex),
}).strict();

export type ExactHyperliquidPayload = z.infer<typeof ExactHyperliquidPayloadSchema>;

export const HyperliquidErrorReasons = [
  "invalid_x402_version",
  "unsupported_scheme",
  "network_mismatch",
  "invalid_exact_hl_payload",
  "invalid_exact_hl_payload_signature",
  "invalid_exact_hl_payload_signer_mismatch",
  "invalid_exact_hl_payload_nonce_mismatch",
  "invalid_exact_hl_payload_chain_mismatch",
  "invalid_exact_hl_payload_asset_mismatch",
  "invalid_exact_hl_payload_recipient_mismatch",
  "invalid_exact_hl_payload_amount_mismatch",
  "invalid_exact_hl_network",
  "hl_exchange_error",
  "hl_tx_not_found",
  "hl_tx_unconfirmed",
  "hl_transfer_not_confirmed",
] as const;
