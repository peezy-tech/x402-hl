import {
  PaymentPayload,
  PaymentRequirements,
  SchemeNetworkFacilitator,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import type { InfoClient } from "@nktkas/hyperliquid";
import type { UserNonFundingLedgerUpdatesResponse } from "@nktkas/hyperliquid/api/info";
import { ExactHyperliquidPayload, ExactHyperliquidPayloadSchema } from "../../types";
import {
  HYPERLIQUID_WILDCARD_CAIP2,
  SupportedHyperliquidNetworks,
  getExchangeBaseUrl,
  createInfoClient,
  fetchTransactionDetails,
  fetchHyperliquidTokenInfo,
} from "../../utils";

const SETTLEMENT_CACHE_TTL_MS = 5 * 60 * 1000;
const MATCH_LOOKBACK_MS = 5 * 1000;
const MATCH_LOOKAHEAD_MS = 30 * 1000;
const MATCH_ATTEMPTS = 5;
const MATCH_RETRY_DELAY_MS = 500;

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
    if (payload.x402Version !== 2) {
      return { isValid: false, invalidReason: "invalid_x402_version" };
    }
    if (payload.accepted?.scheme !== "exact" || requirements.scheme !== "exact") {
      return { isValid: false, invalidReason: "unsupported_scheme" };
    }
    if (payload.accepted?.network !== requirements.network) {
      return { isValid: false, invalidReason: "network_mismatch" };
    }
    if (!SupportedHyperliquidNetworks.includes(requirements.network as any)) {
      return { isValid: false, invalidReason: "invalid_exact_hl_network" };
    }

    const parsed = ExactHyperliquidPayloadSchema.safeParse(payload.payload);
    if (!parsed.success) {
      return { isValid: false, invalidReason: "invalid_exact_hl_payload" };
    }
    const exactPayload = parsed.data;
    const action = exactPayload.action as Record<string, unknown>;
    if (!action || typeof action !== "object") {
      return { isValid: false, invalidReason: "invalid_exact_hl_payload" };
    }

    if (!this.validateActionShape(action)) {
      return { isValid: false, invalidReason: "invalid_exact_hl_payload" };
    }

    const destination = action.destination as string | undefined;
    const token = action.token as string | undefined;
    const amount = action.amount as string | undefined;

    if (!destination || !token || !amount) {
      return { isValid: false, invalidReason: "invalid_exact_hl_payload" };
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

    const actionTime = typeof action.time === "number" ? action.time : action.nonce;
    if (!this.validateTtl(actionTime, requirements.maxTimeoutSeconds)) {
      return { isValid: false, invalidReason: "payment_expired" };
    }

    return { isValid: true, payer: exactPayload.user };
  }

  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    const parsed = ExactHyperliquidPayloadSchema.safeParse(payload.payload);
    const payer = parsed.success ? parsed.data.user : undefined;

    const verification = await this.verify(payload, requirements);
    if (!verification.isValid) {
      return {
        success: false,
        errorReason: verification.invalidReason,
        transaction: "",
        network: requirements.network,
        payer,
      };
    }
    if (!parsed.success) {
      return {
        success: false,
        errorReason: "invalid_exact_hl_payload",
        transaction: "",
        network: requirements.network,
        payer,
      };
    }

    const exactPayload = parsed.data;
    const idempotencyKey = this.settlementKey(requirements.network, exactPayload);
    const cached = this.getCachedSettlement(idempotencyKey);
    if (cached) return cached;

    const pending = this.pendingSettlements.get(idempotencyKey);
    if (pending) return pending;

    const settlement = this.settleVerified(exactPayload, requirements, exactPayload.user)
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
  ): Promise<SettleResponse> {
    const endpoint = getExchangeBaseUrl(requirements.network as any);
    const infoClient = createInfoClient(requirements.network as any);

    try {
      const exchangeResponse = await this.submitToExchange(endpoint, exactPayload);
      const exchangeTxHash = this.exchangeTxHash(exchangeResponse);

      const matchedHash = payer
        ? await this.findMatchingTransaction(infoClient, payer, exactPayload, requirements)
        : undefined;

      const txHash = matchedHash ?? exchangeTxHash;

      if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
        return {
          success: false,
          errorReason: "hl_tx_not_found",
          transaction: txHash ?? "",
          network: requirements.network,
          payer,
        };
      }

      const confirmed = await this.confirmTransaction(infoClient, txHash);
      if (!confirmed) {
        return {
          success: false,
          errorReason: "hl_tx_unconfirmed",
          transaction: txHash,
          network: requirements.network,
          payer,
        };
      }

      return {
        success: true,
        transaction: txHash,
        network: requirements.network,
        payer,
      };
    } catch (error) {
      console.error("Hyperliquid settle error:", error);
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

  private exchangeTxHash(response: HyperliquidExchangeResponse): string | undefined {
    if (response.hash) return response.hash;
    const nested = response.response;
    if (!nested || typeof nested !== "object") return undefined;
    const txHash = nested.txHash;
    return typeof txHash === "string" ? txHash : undefined;
  }

  private async confirmTransaction(client: InfoClient, hash: string): Promise<boolean> {
    for (let i = 0; i < 3; i++) {
      try {
        const tx = await fetchTransactionDetails(client, hash as `0x${string}`);
        return tx.error == null;
      } catch {}
      await new Promise(r => setTimeout(r, 250));
    }
    return false;
  }

  private async findMatchingTransaction(
    client: InfoClient,
    payer: string,
    payload: ExactHyperliquidPayload,
    requirements: PaymentRequirements,
  ): Promise<string | undefined> {
    const action = payload.action as Record<string, unknown>;
    const destination = typeof action.destination === "string" ? action.destination : undefined;
    const token = typeof action.token === "string" ? action.token : undefined;
    const amount = typeof action.amount === "string" ? action.amount : undefined;
    if (!destination || !token || !amount) return undefined;

    const decimals = await this.resolveDecimals(requirements);
    const startTime = Math.max(0, payload.nonce - MATCH_LOOKBACK_MS);

    for (let attempt = 0; attempt < MATCH_ATTEMPTS; attempt++) {
      try {
        const updates = await client.userNonFundingLedgerUpdates({
          user: payer as `0x${string}`,
          startTime,
          endTime: Date.now() + MATCH_LOOKAHEAD_MS,
        });
        const match = updates.find(update =>
          this.ledgerUpdateMatchesPayment(update, {
            payer,
            destination,
            token,
            amount,
            requirements,
            decimals,
          }),
        );
        if (match) return match.hash;
      } catch {}

      if (attempt < MATCH_ATTEMPTS - 1) {
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
    },
  ): boolean {
    const delta = update.delta;
    if (delta.type !== "spotTransfer") return false;
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

  private validateAmount(
    payloadAmount: string,
    requiredAmount: string,
    decimals?: number,
  ): boolean {
    if (decimals == null || decimals < 0) {
      return Number(payloadAmount) >= Number(requiredAmount);
    }
    try {
      const payloadAtomic = this.decimalToAtomic(payloadAmount, decimals);
      return payloadAtomic >= BigInt(requiredAmount);
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
    return Date.now() <= actionTime + maxTimeoutSeconds * 1000;
  }

  private validateActionShape(action: Record<string, unknown>): boolean {
    if (action.type === "spotSend") return true;
    if (action.type !== "sendAsset") return false;
    return action.sourceDex === "spot" && action.destinationDex === "spot";
  }
}
