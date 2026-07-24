import {
  PaymentPayload,
  PaymentRequirements,
  SchemeNetworkFacilitator,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import type { InfoClient } from "@nktkas/hyperliquid";
import type { UserNonFundingLedgerUpdatesResponse } from "@nktkas/hyperliquid/api/info";
import { getAddress } from "viem";
import { ExactHyperliquidPayload, ExactHyperliquidPayloadSchema } from "../../types";
import {
  HYPERLIQUID_WILDCARD_CAIP2,
  getExchangeBaseUrl,
  createInfoClient,
  fetchTransactionDetails,
} from "../../utils";
import {
  decimalToAtomic,
  MAX_CLOCK_SKEW_MS,
  resolveDecimals,
  tokenMatchesRequirements,
  validateTtl,
  verifyExactHyperliquidPayment,
} from "./verification";

const SETTLEMENT_CACHE_TTL_MS = 5 * 60 * 1000;
const MATCH_LOOKAHEAD_MS = 30 * 1000;
const PRE_SUBMIT_RECONCILIATION_ATTEMPTS = 5;
const MATCH_RETRY_DELAY_MS = 1000;
const PRE_SUBMIT_RECONCILIATION_TIMEOUT_MS = 30 * 1000;
const POST_SUBMIT_CONFIRMATION_TIMEOUT_MS = 30 * 1000;
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
    return this.verifyPayment(payload, requirements, { allowExpired: false });
  }

  private async verifyPayment(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    options: { allowExpired: boolean },
  ): Promise<VerifyResponse> {
    return verifyExactHyperliquidPayment(payload, requirements, {
      ...options,
      validateTtl: (actionTime, maxTimeoutSeconds, allowExpired) =>
        this.validateTtl(actionTime, maxTimeoutSeconds, allowExpired),
    });
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
      allowExpired: true,
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

    const expiredAtStart = !this.validateTtl(
      exactPayload.action.nonce,
      requirements.maxTimeoutSeconds,
    );
    const settlement = this.settleVerified(
      exactPayload,
      requirements,
      payer,
      expiredAtStart,
    )
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
    expiredAtStart: boolean,
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
      const reconciliationDeadline =
        Date.now() + PRE_SUBMIT_RECONCILIATION_TIMEOUT_MS;
      const existingHash = await this.findConfirmedTransaction(
        infoClient,
        payer,
        exactPayload,
        requirements,
        expiredAtStart ? PRE_SUBMIT_RECONCILIATION_ATTEMPTS : 1,
        reconciliationDeadline,
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

      if (
        !this.validateTtl(
          exactPayload.action.nonce,
          requirements.maxTimeoutSeconds,
        )
      ) {
        return {
          success: false,
          errorReason: "payment_expired",
          transaction: "",
          network: requirements.network,
          payer,
        };
      }

      const confirmationDeadline =
        Date.now() + POST_SUBMIT_CONFIRMATION_TIMEOUT_MS;
      let submissionFailed = false;
      try {
        await this.runBeforeDeadline(confirmationDeadline, signal =>
          this.submitToExchange(endpoint, exactPayload, signal),
        );
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
        undefined,
        confirmationDeadline,
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
    signal?: AbortSignal,
  ): Promise<HyperliquidExchangeResponse> {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
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

  private async runBeforeDeadline<T>(
    deadline: number,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("confirmation deadline exceeded");

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("confirmation deadline exceeded"));
      }, remaining);
    });

    try {
      return await Promise.race([operation(controller.signal), timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async confirmTransaction(
    hash: string,
    payer: string,
    payload: ExactHyperliquidPayload,
    requirements: PaymentRequirements,
    deadline?: number,
  ): Promise<boolean> {
    for (let i = 0; i < 3; i++) {
      if (deadline != null && Date.now() >= deadline) return false;
      try {
        const tx = deadline == null
          ? await fetchTransactionDetails(requirements.network, hash as `0x${string}`)
          : await this.runBeforeDeadline(deadline, signal =>
              fetchTransactionDetails(
                requirements.network,
                hash as `0x${string}`,
                signal,
              ),
            );
        if (deadline != null && Date.now() >= deadline) return false;
        if (tx.error != null || tx.user.toLowerCase() !== payer.toLowerCase()) {
          return false;
        }
        const action = tx.action as Record<string, unknown>;
        const expected = payload.action;
        const decimals = deadline == null
          ? await resolveDecimals(requirements)
          : await this.runBeforeDeadline(deadline, signal =>
              resolveDecimals(requirements, signal),
            );
        if (deadline != null && Date.now() >= deadline) return false;
        return (
          action.type === "sendAsset" &&
          action.signatureChainId === expected.signatureChainId &&
          action.hyperliquidChain === expected.hyperliquidChain &&
          typeof action.destination === "string" &&
          action.destination.toLowerCase() === expected.destination.toLowerCase() &&
          typeof action.token === "string" &&
          tokenMatchesRequirements(action.token, expected.token) &&
          typeof action.amount === "string" &&
          this.decimalAmountsEqual(action.amount, expected.amount, decimals) &&
          action.nonce === expected.nonce
        );
      } catch {}
      const remaining = deadline == null ? 250 : deadline - Date.now();
      if (remaining <= 0) return false;
      await new Promise(r => setTimeout(r, Math.min(250, remaining)));
    }
    return false;
  }

  private async findConfirmedTransaction(
    client: InfoClient,
    payer: string,
    payload: ExactHyperliquidPayload,
    requirements: PaymentRequirements,
    attempts?: number,
    operationDeadline?: number,
  ): Promise<string | undefined> {
    const action = payload.action as Record<string, unknown>;
    const destination = typeof action.destination === "string" ? action.destination : undefined;
    const token = typeof action.token === "string" ? action.token : undefined;
    const amount = typeof action.amount === "string" ? action.amount : undefined;
    if (!destination || !token || !amount) return undefined;

    const deadline =
      operationDeadline ??
      (attempts === undefined
        ? Date.now() + POST_SUBMIT_CONFIRMATION_TIMEOUT_MS
        : undefined);
    let decimals: number | undefined;
    try {
      decimals = deadline == null
        ? await resolveDecimals(requirements)
        : await this.runBeforeDeadline(deadline, signal =>
            resolveDecimals(requirements, signal),
          );
    } catch {
      return undefined;
    }
    const startTime = Math.max(0, payload.nonce - MATCH_LOOKBACK_MS);
    let attempt = 0;

    while (
      (attempts === undefined || attempt < attempts) &&
      (deadline == null || Date.now() < deadline)
    ) {
      attempt += 1;
      try {
        const updateParameters = {
          user: payer as `0x${string}`,
          startTime,
          endTime: Date.now() + MATCH_LOOKAHEAD_MS,
        };
        const updates = deadline == null
          ? await client.userNonFundingLedgerUpdates(updateParameters)
          : await this.runBeforeDeadline(deadline, signal =>
              client.userNonFundingLedgerUpdates(updateParameters, signal),
            );
        if (deadline != null && Date.now() >= deadline) break;
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
              deadline,
            ))
          ) {
            return candidate.hash;
          }
        }
      } catch {}

      if (attempts !== undefined && attempt >= attempts) break;
      const remaining =
        deadline == null ? MATCH_RETRY_DELAY_MS : deadline - Date.now();
      if (remaining <= 0) break;
      await new Promise(r =>
        setTimeout(r, Math.min(MATCH_RETRY_DELAY_MS, remaining)),
      );
    }

    return undefined;
  }

  private settlementKey(network: string, payload: ExactHyperliquidPayload): string {
    const action = payload.action as Record<string, unknown>;
    const destination =
      typeof action.destination === "string" ? action.destination.toLowerCase() : "";
    const token = typeof action.token === "string" ? action.token.toLowerCase() : "";
    const amount = typeof action.amount === "string" ? action.amount : "";
    const signatureChainId =
      typeof action.signatureChainId === "string"
        ? BigInt(action.signatureChainId).toString()
        : "";
    return [
      network,
      payload.user.toLowerCase(),
      String(payload.nonce),
      signatureChainId,
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
    if (tokenMatchesRequirements(ledgerToken, payloadToken)) return true;
    if (tokenMatchesRequirements(ledgerToken, requiredAsset)) return true;
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
        return decimalToAtomic(left, decimals) === decimalToAtomic(right, decimals);
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

  private validateTtl(
    actionTime: unknown,
    maxTimeoutSeconds: number,
    allowExpired = false,
  ): boolean {
    return validateTtl(actionTime, maxTimeoutSeconds, allowExpired);
  }

  private paymentNonce(payload: ExactHyperliquidPayload): number | undefined {
    return payload.action.nonce;
  }
}
