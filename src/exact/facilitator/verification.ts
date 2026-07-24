import { SendAssetTypes } from "@nktkas/hyperliquid/api/exchange";
import type {
  PaymentPayload,
  PaymentRequirements,
  VerifyResponse,
} from "@x402/core/types";
import { getAddress, recoverTypedDataAddress } from "viem";
import { ExactHyperliquidPayloadSchema } from "../../types";
import {
  fetchHyperliquidTokenInfo,
  getHyperliquidChainName,
  SupportedHyperliquidNetworks,
} from "../../utils";

export const MAX_CLOCK_SKEW_MS = 30 * 1000;

export async function verifyExactHyperliquidPayment(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  options: {
    allowExpired: boolean;
    validateTtl?: typeof validateTtl;
  },
): Promise<VerifyResponse> {
  if (payload.x402Version !== 2) {
    return { isValid: false, invalidReason: "invalid_x402_version" };
  }
  if (payload.accepted?.scheme !== "exact" || requirements.scheme !== "exact") {
    return { isValid: false, invalidReason: "unsupported_scheme" };
  }
  if (payload.accepted?.network !== requirements.network) {
    return { isValid: false, invalidReason: "network_mismatch" };
  }
  if (!paymentRequirementsMatch(payload.accepted, requirements)) {
    return { isValid: false, invalidReason: "invalid_exact_hl_payload" };
  }
  if (!SupportedHyperliquidNetworks.includes(requirements.network as any)) {
    return { isValid: false, invalidReason: "invalid_exact_hl_network" };
  }

  const parsed = ExactHyperliquidPayloadSchema.safeParse(payload.payload);
  if (!parsed.success) {
    return { isValid: false, invalidReason: "invalid_exact_hl_payload" };
  }
  const exactPayload = parsed.data;
  const action = exactPayload.action;

  if (action.hyperliquidChain !== getHyperliquidChainName(requirements.network)) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_hl_payload_chain_mismatch",
    };
  }
  if (action.nonce !== exactPayload.nonce) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_hl_payload_nonce_mismatch",
    };
  }
  if (action.destination.toLowerCase() !== requirements.payTo.toLowerCase()) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_hl_payload_recipient_mismatch",
    };
  }
  if (!tokenMatchesRequirements(action.token, requirements.asset)) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_hl_payload_asset_mismatch",
    };
  }
  if (
    !(options.validateTtl ?? validateTtl)(
      action.nonce,
      requirements.maxTimeoutSeconds,
      options.allowExpired,
    )
  ) {
    return { isValid: false, invalidReason: "payment_expired" };
  }

  const decimals = await resolveDecimals(requirements);
  if (!validateAmount(action.amount, requirements.amount, decimals)) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_hl_payload_amount_mismatch",
    };
  }

  try {
    const recoveredPayer = getAddress(
      await recoverTypedDataAddress({
        domain: {
          name: "HyperliquidSignTransaction",
          version: "1",
          chainId: BigInt(action.signatureChainId),
          verifyingContract: "0x0000000000000000000000000000000000000000",
        },
        types: SendAssetTypes,
        primaryType: "HyperliquidTransaction:SendAsset",
        message: action,
        signature: {
          r: exactPayload.signature.r as `0x${string}`,
          s: exactPayload.signature.s as `0x${string}`,
          yParity: exactPayload.signature.v - 27,
        },
      }),
    );
    if (recoveredPayer !== getAddress(exactPayload.user)) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_hl_payload_signer_mismatch",
      };
    }
    return { isValid: true, payer: recoveredPayer };
  } catch {
    return {
      isValid: false,
      invalidReason: "invalid_exact_hl_payload_signature",
    };
  }
}

export async function resolveDecimals(
  requirements: PaymentRequirements,
  signal?: AbortSignal,
): Promise<number | undefined> {
  if (typeof requirements.extra?.decimals === "number") {
    return requirements.extra.decimals;
  }
  const tokenId = extractTokenId(requirements.asset);
  if (!tokenId) return undefined;
  try {
    const info = await fetchHyperliquidTokenInfo(
      requirements.network,
      tokenId,
      signal,
    );
    return info.decimals;
  } catch {
    return undefined;
  }
}

export function tokenMatchesRequirements(
  payloadToken: string,
  requiredAsset: string,
): boolean {
  if (payloadToken === requiredAsset) return true;
  const payloadTokenId = extractTokenId(payloadToken)?.toLowerCase();
  const requiredTokenId = extractTokenId(requiredAsset)?.toLowerCase();
  return Boolean(
    payloadTokenId && requiredTokenId && payloadTokenId === requiredTokenId,
  );
}

export function validateAmount(
  payloadAmount: string,
  requiredAmount: string,
  decimals?: number,
): boolean {
  if (decimals == null || decimals < 0) {
    return normalizeDecimal(payloadAmount) === normalizeDecimal(requiredAmount);
  }
  try {
    return decimalToAtomic(payloadAmount, decimals) === BigInt(requiredAmount);
  } catch {
    return false;
  }
}

export function decimalToAtomic(value: string, decimals: number): bigint {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) throw new Error("invalid decimal amount");
  const [, whole, fraction = ""] = match;
  if (/[1-9]/.test(fraction.slice(decimals))) {
    throw new Error("decimal amount exceeds token precision");
  }
  const normalizedFraction = fraction.slice(0, decimals).padEnd(decimals, "0");
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(normalizedFraction || "0");
}

export function validateTtl(
  actionTime: unknown,
  maxTimeoutSeconds: number,
  allowExpired = false,
): boolean {
  if (typeof actionTime !== "number") return false;
  const now = Date.now();
  return (
    actionTime <= now + MAX_CLOCK_SKEW_MS &&
    (allowExpired || now <= actionTime + maxTimeoutSeconds * 1000)
  );
}

function extractTokenId(asset: string): string | undefined {
  if (!asset) return undefined;
  const parts = asset.split(":");
  return parts.length === 2
    ? parts[1]
    : parts[0]?.startsWith("0x")
      ? parts[0]
      : undefined;
}

function paymentRequirementsMatch(
  accepted: PaymentRequirements,
  required: PaymentRequirements,
): boolean {
  if (typeof accepted.payTo !== "string" || typeof required.payTo !== "string") {
    return false;
  }
  return (
    accepted.scheme === required.scheme &&
    accepted.network === required.network &&
    accepted.asset === required.asset &&
    accepted.amount === required.amount &&
    accepted.payTo.toLowerCase() === required.payTo.toLowerCase() &&
    accepted.maxTimeoutSeconds === required.maxTimeoutSeconds
  );
}

function normalizeDecimal(value: string): string {
  return value
    .trim()
    .replace(/^0+(?=\d)/, "")
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
}
