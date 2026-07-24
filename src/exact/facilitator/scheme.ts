import {
  PaymentPayload,
  PaymentRequirements,
  SchemeNetworkFacilitator,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import type { InfoClient } from "@nktkas/hyperliquid";
import type { UserNonFundingLedgerUpdatesResponse } from "@nktkas/hyperliquid/api/info";
import { SendAssetTypes } from "@nktkas/hyperliquid/api/exchange";
import { getAddress, recoverTypedDataAddress } from "viem";
import { ExactHyperliquidPayload, ExactHyperliquidPayloadSchema } from "../../types";
import {
  HYPERLIQUID_WILDCARD_CAIP2,
  SupportedHyperliquidNetworks,
  getExchangeBaseUrl,
  createInfoClient,
  fetchTransactionDetails,
  fetchHyperliquidTokenInfo,
  getHyperliquidChainName,
} from "../../utils";

const SETTLEMENT_CACHE_TTL_MS = 5 * 60 * 1000;
const MATCH_LOOKAHEAD_MS = 30 * 1000;
const MATCH_ATTEMPTS = 5;
const MATCH_RETRY_DELAY_MS = 500;
const MAX_CLOCK_SKEW_MS = 30 * 1000;
// The nonce is the client's wall clock, which validateTtl accepts up to
// MAX_CLOCK_SKEW_MS ahead of ours; the exchange ledger timestamp can lag the
// nonce by the same skew, so the query must look back at least that far or a
// settled transfer from a fast client clock is never found.
const MATCH_LOOKBACK_MS = MAX_CLOCK_SKEW_MS;
// A payment can pass verify() in the last millisecond of its TTL and still
// take submit plus confirmation latency to appear in the ledger, with the
// exchange clock skewed relative to ours. The window is only a candidate
// pre-filter — confirmTransaction still pins the exact signed nonce — so the
// late side gets skew plus a latency allowance rather than a hard cutoff.
const MATCH_WINDOW_LATE_GRACE_MS = MAX_CLOCK_SKEW_MS + MATCH_LOOKAHEAD_MS;

type HyperliquidExchangeResponse = {
  status: string;
  response?: string | Record<string, unknown>;
  hash?: string;
};

type LedgerUpdate = UserNonFundingLedgerUpdatesResponse[number];

export class ExactHyperliquidScheme implements SchemeNetworkFacilitator {
  readonly scheme = "exact";
  readonly caipFamily = HYPERLIQUID_WILDCARD_CAIP2;

  private readonly pendingSettlements = new Map<string, Promise<SettleResponse>>();
  private readonly settledCache = new Map<
    string,
    { expiresAt: number; response: SettleResponse }
  >();

  getExtra(_: string): Record<string, unknown> | undefined {
    return undefined;
  }

  getSigners(_: string): string[] {
    return [];
  }

  async verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    return this.verifyPayment(payload, requirements, { enforceTtl: true });
  }

  private async verifyPayment(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    options: { enforceTtl: boolean },
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
    if (!this.paymentRequirementsMatch(payload.accepted, requirements)) {
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
    const destination = action.destination;
    const token = action.token;
    const amount = action.amount;

    if (
      action.hyperliquidChain !== getHyperliquidChainName(requirements.network)
    ) {
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

    if (destination.toLowerCase() !== requirements.payTo.toLowerCase()) {
      return { isValid: false, invalidReason: "invalid_exact_hl_payload_recipient_mismatch" };
    }

    if (!this.tokenMatchesRequirements(token, requirements.asset)) {
      return { isValid: false, invalidReason: "invalid_exact_hl_payload_asset_mismatch" };
    }

    const decimals = await this.resolveDecimals(requirements);
    if (!this.validateAmount(amount, requirements.amount, decimals)) {
      return { isValid: false, invalidReason: "invalid_exact_hl_payload_amount_mismatch" };
    }

    if (
      options.enforceTtl &&
      !this.validateTtl(action.nonce, requirements.maxTimeoutSeconds)
    ) {
      return { isValid: false, invalidReason: "payment_expired" };
    }

    let recoveredPayer: string;
    try {
      recoveredPayer = await recoverTypedDataAddress({
        domain: {
          name: "HyperliquidSignTransaction",
          version: "1",
          chainId: Number.parseInt(action.signatureChainId),
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
      });
    } catch {
      return {
        isValid: false,
        invalidReason: "invalid_exact_hl_payload_signature",
      };
    }
    if (getAddress(recoveredPayer) !== getAddress(exactPayload.user)) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_hl_payload_signer_mismatch",
      };
    }

    return { isValid: true, payer: getAddress(recoveredPayer) };
  }

  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    // TTL is enforced after ledger reconciliation instead of up front: a
    // settle retry can arrive after the payment TTL lapsed (for example when
    // the process crashed between on-chain confirmation and recording the
    // response), and rejecting it here would permanently report an
    // already-settled payment as payment_expired.
    const verification = await this.verifyPayment(payload, requirements, {
      enforceTtl: false,
    });
    if (!verification.isValid) {
      return {
        success: false,
        errorReason: verification.invalidReason,
        transaction: "",
        network: requirements.network,
        payer: verification.payer,
      };
    }
    const parsed = ExactHyperliquidPayloadSchema.safeParse(payload.payload);
    if (!parsed.success) {
      return {
        success: false,
        errorReason: "invalid_exact_hl_payload",
        transaction: "",
        network: requirements.network,
        payer: verification.payer,
      };
    }
    const payer = verification.payer;
    if (!payer) {
      return {
        success: false,
        errorReason: "invalid_exact_hl_payload_signature",
        transaction: "",
        network: requirements.network,
      };
    }

    const exactPayload = parsed.data;
    const idempotencyKey = this.settlementKey(requirements.network, exactPayload);
    const cached = this.getCachedSettlement(idempotencyKey);
    if (cached) return cached;

    const pending = this.pendingSettlements.get(idempotencyKey);
    if (pending) return pending;

    const ttlValid = this.validateTtl(
      exactPayload.action.nonce,
      requirements.maxTimeoutSeconds,
    );
    const settlement = this.settleVerified(exactPayload, requirements, payer, ttlValid)
      .then(response => {
        if (response.success) {
          this.cacheSettlement(idempotencyKey, response);
        }
        return response;
      })
      .finally(() => {
        this.pendingSettlements.delete(idempotencyKey);
      });

    this.pendingSettlements.set(idempotencyKey, settlement);
    return settlement;
  }

  private async settleVerified(
    exactPayload: ExactHyperliquidPayload,
    requirements: PaymentRequirements,
    payer: string,
    ttlValid: boolean,
  ): Promise<SettleResponse> {
    const endpoint = getExchangeBaseUrl(requirements.network as any);
    const infoClient = createInfoClient(requirements.network as any);

    try {
      // Reconcile before submitting so a process restart does not blindly
      // replay an already-settled signed action. A fresh payment has nothing
      // to reconcile, so a single lookup keeps the happy path fast; the
      // retried polling only belongs in the post-submit confirmation below.
      // An expired payment is reconciliation's last chance to recover a
      // transfer that confirmed before a crash, so it gets the full retry
      // budget instead.
      const existingHash = await this.findConfirmedTransaction(
        infoClient,
        payer,
        exactPayload,
        requirements,
        ttlValid ? 1 : MATCH_ATTEMPTS,
      );
      if (existingHash) {
        return {
          success: true,
          transaction: existingHash,
          network: requirements.network,
          payer,
          amount: requirements.amount,
        };
      }

      if (!ttlValid) {
        return {
          success: false,
          errorReason: "payment_expired",
          transaction: "",
          network: requirements.network,
          payer,
        };
      }

      let submissionFailed = false;
      try {
        await this.submitToExchange(endpoint, exactPayload);
      } catch {
        // Exchange errors and lost responses are ambiguous: the action may have
        // settled before the response failed or a restart replayed its nonce.
        submissionFailed = true;
      }

      const matchedHash = await this.findConfirmedTransaction(
        infoClient,
        payer,
        exactPayload,
        requirements,
      );
      if (matchedHash) {
        return {
          success: true,
          transaction: matchedHash,
          network: requirements.network,
          payer,
          amount: requirements.amount,
        };
      }

      return {
        success: false,
        errorReason: submissionFailed
          ? "hl_exchange_error"
          : "hl_transfer_not_confirmed",
        transaction: "",
        network: requirements.network,
        payer,
      };
    } catch {
      return {
        success: false,
        errorReason: "hl_exchange_error",
        transaction: "",
        network: requirements.network,
        payer,
      };
    }
  }

  private async submitToExchange(
    endpoint: string,
    payload: ExactHyperliquidPayload,
  ): Promise<HyperliquidExchangeResponse> {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: payload.action,
        signature: payload.signature,
        nonce: payload.nonce,
      }),
    });
    const responseText = await response.text();
    const body = this.parseExchangeResponse(responseText);
    if (!response.ok) {
      throw new Error(
        `hyperliquid_exchange_failed status=${response.status} body=${this.exchangeErrorBody(body)}`,
      );
    }
    if (body?.status !== "ok") {
      throw new Error(`hyperliquid_exchange_failed body=${this.exchangeErrorBody(body)}`);
    }
    return body;
  }

  private parseExchangeResponse(responseText: string): HyperliquidExchangeResponse {
    try {
      return JSON.parse(responseText) as HyperliquidExchangeResponse;
    } catch {
      return { status: "err", response: responseText };
    }
  }

  private exchangeErrorBody(body: unknown): string {
    try {
      return JSON.stringify(body).slice(0, 500);
    } catch {
      return String(body).slice(0, 500);
    }
  }

  private async confirmTransaction(
    hash: string,
    payer: string,
    payload: ExactHyperliquidPayload,
    requirements: PaymentRequirements,
  ): Promise<boolean> {
    for (let i = 0; i < 3; i++) {
      try {
        const tx = await fetchTransactionDetails(
          requirements.network,
          hash as `0x${string}`,
        );
        if (tx.error != null || tx.user.toLowerCase() !== payer.toLowerCase()) {
          return false;
        }
        const action = tx.action as Record<string, unknown>;
        const expected = payload.action;
        const decimals = await this.resolveDecimals(requirements);
        return (
          action.type === "sendAsset" &&
          action.signatureChainId === expected.signatureChainId &&
          action.hyperliquidChain === expected.hyperliquidChain &&
          typeof action.destination === "string" &&
          action.destination.toLowerCase() === expected.destination.toLowerCase() &&
          typeof action.token === "string" &&
          this.tokenMatchesRequirements(action.token, expected.token) &&
          typeof action.amount === "string" &&
          this.decimalAmountsEqual(action.amount, expected.amount, decimals) &&
          action.nonce === expected.nonce
        );
      } catch {}
      await new Promise(r => setTimeout(r, 250));
    }
    return false;
  }

  private async findConfirmedTransaction(
    client: InfoClient,
    payer: string,
    payload: ExactHyperliquidPayload,
    requirements: PaymentRequirements,
    attempts: number = MATCH_ATTEMPTS,
  ): Promise<string | undefined> {
    const action = payload.action as Record<string, unknown>;
    const destination = typeof action.destination === "string" ? action.destination : undefined;
    const token = typeof action.token === "string" ? action.token : undefined;
    const amount = typeof action.amount === "string" ? action.amount : undefined;
    if (!destination || !token || !amount) return undefined;

    const decimals = await this.resolveDecimals(requirements);
    const startTime = Math.max(0, payload.nonce - MATCH_LOOKBACK_MS);

    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const updates = await client.userNonFundingLedgerUpdates({
          user: payer as `0x${string}`,
          startTime,
          endTime: Date.now() + MATCH_LOOKAHEAD_MS,
        });
        const candidates = updates.filter(update =>
          this.ledgerUpdateMatchesPayment(update, {
            payer,
            destination,
            token,
            amount,
            requirements,
            decimals,
            nonce: this.paymentNonce(payload),
          }),
        );
        for (const candidate of candidates) {
          if (
            /^0x[0-9a-fA-F]{64}$/.test(candidate.hash) &&
            (await this.confirmTransaction(
              candidate.hash,
              payer,
              payload,
              requirements,
            ))
          ) {
            return candidate.hash;
          }
        }
      } catch {}

      if (attempt < attempts - 1) {
        await new Promise(r => setTimeout(r, MATCH_RETRY_DELAY_MS));
      }
    }

    return undefined;
  }

  private settlementKey(network: string, payload: ExactHyperliquidPayload): string {
    const action = payload.action as Record<string, unknown>;
    const destination =
      typeof action.destination === "string" ? action.destination.toLowerCase() : "";
    const token = typeof action.token === "string" ? action.token.toLowerCase() : "";
    const amount = typeof action.amount === "string" ? action.amount : "";
    return [
      network,
      payload.user.toLowerCase(),
      String(payload.nonce),
      destination,
      token,
      amount,
    ].join(":");
  }

  private getCachedSettlement(key: string): SettleResponse | undefined {
    const cached = this.settledCache.get(key);
    if (!cached) return undefined;
    if (cached.expiresAt <= Date.now()) {
      this.settledCache.delete(key);
      return undefined;
    }
    return { ...cached.response };
  }

  private cacheSettlement(key: string, response: SettleResponse): void {
    this.settledCache.set(key, {
      expiresAt: Date.now() + SETTLEMENT_CACHE_TTL_MS,
      response: { ...response },
    });
  }

  private ledgerUpdateMatchesPayment(
    update: LedgerUpdate,
    expected: {
      payer: string;
      destination: string;
      token: string;
      amount: string;
      requirements: PaymentRequirements;
      decimals?: number;
      nonce?: number;
    },
  ): boolean {
    const delta = update.delta as {
      type?: string;
      user?: string;
      destination?: string;
      token?: string;
      amount?: string;
      nonce?: number | null;
      sourceDex?: string;
      destinationDex?: string;
    };
    if (!delta.user || !delta.destination || !delta.token || !delta.amount) return false;
    const exactSend =
      delta.type === "send" &&
      delta.sourceDex === "spot" &&
      delta.destinationDex === "spot" &&
      delta.nonce === expected.nonce;
    // The current public info schema reports sendAsset ledger entries as
    // spotTransfer with a null nonce and no dex fields. Treat that row only as
    // a candidate: findConfirmedTransaction still requires the explorer action
    // to match the exact signed sendAsset nonce and all transfer fields.
    const spotTransfer =
      delta.type === "spotTransfer" &&
      delta.nonce == null &&
      delta.sourceDex == null &&
      delta.destinationDex == null;
    if (!exactSend && !spotTransfer) return false;
    if (
      expected.nonce != null &&
      (update.time < expected.nonce - MAX_CLOCK_SKEW_MS ||
        update.time >
          expected.nonce +
            expected.requirements.maxTimeoutSeconds * 1000 +
            MATCH_WINDOW_LATE_GRACE_MS)
    ) {
      return false;
    }
    if (delta.user.toLowerCase() !== expected.payer.toLowerCase()) return false;
    if (delta.destination.toLowerCase() !== expected.destination.toLowerCase()) return false;
    if (!this.ledgerTokenMatches(delta.token, expected.token, expected.requirements.asset))
      return false;
    return this.decimalAmountsEqual(delta.amount, expected.amount, expected.decimals);
  }

  private ledgerTokenMatches(
    ledgerToken: string,
    payloadToken: string,
    requiredAsset: string,
  ): boolean {
    if (this.tokenMatchesRequirements(ledgerToken, payloadToken)) return true;
    if (this.tokenMatchesRequirements(ledgerToken, requiredAsset)) return true;
    const ledgerSymbol = this.extractTokenSymbol(ledgerToken);
    return Boolean(
      ledgerSymbol &&
        (ledgerSymbol === this.extractTokenSymbol(payloadToken) ||
          ledgerSymbol === this.extractTokenSymbol(requiredAsset)),
    );
  }

  private extractTokenSymbol(asset: string): string | undefined {
    const symbol = asset.split(":")[0]?.trim();
    return symbol ? symbol.toLowerCase() : undefined;
  }

  private decimalAmountsEqual(left: string, right: string, decimals?: number): boolean {
    if (decimals != null && decimals >= 0) {
      try {
        return this.decimalToAtomic(left, decimals) === this.decimalToAtomic(right, decimals);
      } catch {
        return false;
      }
    }
    return this.normalizeDecimal(left) === this.normalizeDecimal(right);
  }

  private normalizeDecimal(value: string): string {
    return value
      .trim()
      .replace(/^0+(?=\d)/, "")
      .replace(/(\.\d*?)0+$/, "$1")
      .replace(/\.$/, "");
  }

  private async resolveDecimals(req: PaymentRequirements): Promise<number | undefined> {
    if (typeof req.extra?.decimals === "number") return req.extra.decimals;
    const tokenId = this.extractTokenId(req.asset);
    if (!tokenId) return undefined;
    try {
      const info = await fetchHyperliquidTokenInfo(req.network, tokenId);
      return info.decimals;
    } catch {
      return undefined;
    }
  }

  private extractTokenId(asset: string): string | undefined {
    if (!asset) return undefined;
    const parts = asset.split(":");
    return parts.length === 2 ? parts[1] : parts[0]?.startsWith("0x") ? parts[0] : undefined;
  }

  private tokenMatchesRequirements(payloadToken: string, requiredAsset: string): boolean {
    if (payloadToken === requiredAsset) return true;
    const payloadTokenId = this.extractTokenId(payloadToken)?.toLowerCase();
    const requiredTokenId = this.extractTokenId(requiredAsset)?.toLowerCase();
    return Boolean(payloadTokenId && requiredTokenId && payloadTokenId === requiredTokenId);
  }

  private paymentRequirementsMatch(
    accepted: PaymentRequirements,
    required: PaymentRequirements,
  ): boolean {
    return (
      accepted.scheme === required.scheme &&
      accepted.network === required.network &&
      accepted.asset === required.asset &&
      accepted.amount === required.amount &&
      accepted.payTo.toLowerCase() === required.payTo.toLowerCase() &&
      accepted.maxTimeoutSeconds === required.maxTimeoutSeconds
    );
  }

  private validateAmount(
    payloadAmount: string,
    requiredAmount: string,
    decimals?: number,
  ): boolean {
    if (decimals == null || decimals < 0) {
      return this.normalizeDecimal(payloadAmount) === this.normalizeDecimal(requiredAmount);
    }
    try {
      const payloadAtomic = this.decimalToAtomic(payloadAmount, decimals);
      return payloadAtomic === BigInt(requiredAmount);
    } catch {
      return false;
    }
  }

  private decimalToAtomic(value: string, decimals: number): bigint {
    const [whole, fraction = ""] = value.trim().split(".");
    const normalizedFraction = fraction.padEnd(decimals, "0").slice(0, decimals);
    return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(normalizedFraction || "0");
  }

  private validateTtl(actionTime: unknown, maxTimeoutSeconds: number): boolean {
    if (typeof actionTime !== "number") return false;
    const now = Date.now();
    return (
      actionTime <= now + MAX_CLOCK_SKEW_MS &&
      now <= actionTime + maxTimeoutSeconds * 1000
    );
  }

  private paymentNonce(payload: ExactHyperliquidPayload): number | undefined {
    return payload.action.nonce;
  }
}
