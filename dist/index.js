// src/constants.ts
import { toHex } from "viem";
import { arbitrum } from "viem/chains";
var HYPERLIQUID_MAINNET = "hyperliquid:mainnet";
var HYPERLIQUID_TESTNET = "hyperliquid:testnet";
var HYPERLIQUID_WILDCARD_CAIP2 = "hyperliquid:*";
var SupportedHyperliquidNetworks = [
  HYPERLIQUID_TESTNET,
  HYPERLIQUID_MAINNET
];
var HyperliquidNetworkToChainName = {
  [HYPERLIQUID_TESTNET]: "Testnet",
  [HYPERLIQUID_MAINNET]: "Mainnet"
};
var HyperliquidNetworkConfigs = {
  [HYPERLIQUID_TESTNET]: {
    token: "USDC:0xeb62eee3685fc4c43992febcd9e75443",
    decimals: 8,
    signatureChainId: toHex(arbitrum.id)
  },
  [HYPERLIQUID_MAINNET]: {
    token: "USDC:0x6d1e7cde53ba9467b783cb7c530ce054",
    decimals: 8,
    signatureChainId: toHex(arbitrum.id)
  }
};
function getExchangeBaseUrl(network) {
  return network === HYPERLIQUID_TESTNET ? "https://api.hyperliquid-testnet.xyz/exchange" : "https://api.hyperliquid.xyz/exchange";
}
function isHyperliquidNetwork(network) {
  return SupportedHyperliquidNetworks.includes(network);
}

// src/types.ts
import { z } from "zod";
var HyperliquidTokenIdRegex = /^[^:]+:0x[0-9a-fA-F]{32,40}$/;
var Bytes32Regex = /^0x[0-9a-fA-F]{64}$/;
var EvmAddressRegex = /^0x[0-9a-fA-F]{40}$/;
var HexIntegerRegex = /^0x[0-9a-fA-F]+$/;
var DecimalAmountRegex = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
var ExactHyperliquidPayloadSchema = z.object({
  action: z.object({
    type: z.literal("sendAsset"),
    signatureChainId: z.string().regex(HexIntegerRegex),
    hyperliquidChain: z.enum(["Mainnet", "Testnet"]),
    destination: z.string().regex(EvmAddressRegex),
    sourceDex: z.literal("spot"),
    destinationDex: z.literal("spot"),
    token: z.string().regex(HyperliquidTokenIdRegex),
    amount: z.string().regex(DecimalAmountRegex),
    fromSubAccount: z.literal(""),
    nonce: z.number().int().nonnegative().safe()
  }).strict(),
  signature: z.object({
    r: z.string().regex(Bytes32Regex),
    s: z.string().regex(Bytes32Regex),
    v: z.union([z.literal(27), z.literal(28)])
  }).strict(),
  nonce: z.number().int().nonnegative().safe(),
  user: z.string().regex(EvmAddressRegex)
}).strict();
var HyperliquidErrorReasons = [
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
  "payment_expired",
  "hl_exchange_error",
  "hl_tx_not_found",
  "hl_tx_unconfirmed",
  "hl_transfer_not_confirmed"
];

// src/signer.ts
function toClientHyperliquidSigner(wallet) {
  return wallet;
}

// src/utils.ts
import * as hl from "@nktkas/hyperliquid";
function assertHyperliquidNetwork(network) {
  if (!network.startsWith("hyperliquid:") || !SupportedHyperliquidNetworks.includes(network)) {
    throw new Error(`Unsupported Hyperliquid network: ${network}`);
  }
}
function getHyperliquidChainName(network) {
  assertHyperliquidNetwork(network);
  return HyperliquidNetworkToChainName[network];
}
function createInfoClient(network, options) {
  assertHyperliquidNetwork(network);
  const transport = new hl.HttpTransport({
    ...options,
    isTestnet: network === HYPERLIQUID_TESTNET
  });
  return new hl.InfoClient({ transport });
}
async function fetchTransactionDetails(network, hash) {
  assertHyperliquidNetwork(network);
  const transport = new hl.HttpTransport({
    isTestnet: network === HYPERLIQUID_TESTNET
  });
  const client = new hl.ExplorerClient({ transport });
  const response = await client.txDetails({ hash });
  return response.tx;
}
var tokenInfoCache = /* @__PURE__ */ new Map();
async function fetchHyperliquidTokenInfo(network, tokenId) {
  assertHyperliquidNetwork(network);
  const cacheKey = `${network}:${tokenId.toLowerCase()}`;
  const cached = tokenInfoCache.get(cacheKey);
  if (cached) return cached;
  const client = createInfoClient(network);
  const response = await client.tokenDetails({ tokenId });
  const info = {
    decimals: response.weiDecimals,
    symbol: response.name,
    name: response.name,
    tokenId
  };
  tokenInfoCache.set(cacheKey, info);
  return info;
}

// src/exact/client/scheme.ts
import { SendAssetRequest, SendAssetTypes } from "@nktkas/hyperliquid/api/exchange";
import { signUserSignedAction } from "@nktkas/hyperliquid/signing";
import { parse } from "valibot";
import { toHex as toHex2 } from "viem";
import { arbitrum as arbitrum2 } from "viem/chains";
var ExactHyperliquidScheme = class {
  constructor(signer) {
    this.signer = signer;
  }
  signer;
  scheme = "exact";
  async createPaymentPayload(x402Version, paymentRequirements) {
    const signerAddress = this.getSignerAddress();
    const decimals = await this.resolveDecimals(paymentRequirements);
    const nonce = Date.now();
    const request = parse(SendAssetRequest, {
      action: {
        type: "sendAsset",
        signatureChainId: toHex2(arbitrum2.id),
        hyperliquidChain: getHyperliquidChainName(paymentRequirements.network),
        destination: paymentRequirements.payTo,
        sourceDex: "spot",
        destinationDex: "spot",
        token: await this.resolveTokenString(paymentRequirements),
        amount: this.formatDecimalAmount(paymentRequirements.amount, decimals),
        fromSubAccount: "",
        nonce
      },
      nonce,
      signature: {
        r: "0x0000000000000000000000000000000000000000000000000000000000000000",
        s: "0x0000000000000000000000000000000000000000000000000000000000000000",
        v: 27
      }
    });
    const signature = await signUserSignedAction({
      wallet: this.signer,
      action: request.action,
      types: SendAssetTypes
    });
    const payload = ExactHyperliquidPayloadSchema.parse({
      action: request.action,
      signature,
      nonce,
      user: signerAddress
    });
    return { x402Version, payload };
  }
  getSignerAddress() {
    const address = this.signer.address ?? this.signer.account?.address;
    if (!address?.toLowerCase().startsWith("0x")) {
      throw new Error("Hyperliquid wallet missing address");
    }
    return address;
  }
  formatDecimalAmount(amount, decimals) {
    if (typeof decimals !== "number" || decimals <= 0) return amount;
    const bigAmount = BigInt(amount);
    const divisor = 10n ** BigInt(decimals);
    const whole = bigAmount / divisor;
    const remainder = bigAmount % divisor;
    if (remainder === 0n) return whole.toString();
    const remainderStr = remainder.toString().padStart(decimals, "0").replace(/0+$/, "");
    return `${whole}.${remainderStr}`;
  }
  async resolveDecimals(req) {
    if (typeof req.extra?.decimals === "number") return req.extra.decimals;
    const tokenId = req.asset?.startsWith("0x") ? req.asset : void 0;
    if (!tokenId) return void 0;
    try {
      const info = await fetchHyperliquidTokenInfo(req.network, tokenId);
      return info.decimals;
    } catch {
      return void 0;
    }
  }
  async resolveTokenString(req) {
    if (req.asset.includes(":")) return req.asset;
    const symbol = typeof req.extra?.tokenSymbol === "string" ? req.extra.tokenSymbol : void 0;
    if (symbol) return `${symbol}:${req.asset}`;
    try {
      const info = await fetchHyperliquidTokenInfo(req.network, req.asset);
      if (info.symbol) return `${info.symbol}:${req.asset}`;
    } catch {
    }
    return `TOKEN:${req.asset}`;
  }
};

// src/exact/facilitator/scheme.ts
import { SendAssetTypes as SendAssetTypes2 } from "@nktkas/hyperliquid/api/exchange";
import { getAddress, recoverTypedDataAddress } from "viem";
var SETTLEMENT_CACHE_TTL_MS = 5 * 60 * 1e3;
var MATCH_LOOKAHEAD_MS = 30 * 1e3;
var PRE_SUBMIT_RECONCILIATION_ATTEMPTS = 5;
var MATCH_RETRY_DELAY_MS = 1e3;
var POST_SUBMIT_CONFIRMATION_TIMEOUT_MS = 30 * 1e3;
var MAX_CLOCK_SKEW_MS = 30 * 1e3;
var MATCH_LOOKBACK_MS = MAX_CLOCK_SKEW_MS;
var MATCH_WINDOW_LATE_GRACE_MS = MAX_CLOCK_SKEW_MS + MATCH_LOOKAHEAD_MS;
var ExactHyperliquidScheme2 = class {
  scheme = "exact";
  caipFamily = HYPERLIQUID_WILDCARD_CAIP2;
  pendingSettlements = /* @__PURE__ */ new Map();
  settledCache = /* @__PURE__ */ new Map();
  getExtra(_) {
    return void 0;
  }
  getSigners(_) {
    return [];
  }
  async verify(payload, requirements) {
    return this.verifyPayment(payload, requirements, { enforceTtl: true });
  }
  async verifyPayment(payload, requirements, options) {
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
    if (!SupportedHyperliquidNetworks.includes(requirements.network)) {
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
    if (action.hyperliquidChain !== getHyperliquidChainName(requirements.network)) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_hl_payload_chain_mismatch"
      };
    }
    if (action.nonce !== exactPayload.nonce) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_hl_payload_nonce_mismatch"
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
    if (options.enforceTtl && !this.validateTtl(action.nonce, requirements.maxTimeoutSeconds)) {
      return { isValid: false, invalidReason: "payment_expired" };
    }
    let recoveredPayer;
    try {
      recoveredPayer = await recoverTypedDataAddress({
        domain: {
          name: "HyperliquidSignTransaction",
          version: "1",
          chainId: Number.parseInt(action.signatureChainId),
          verifyingContract: "0x0000000000000000000000000000000000000000"
        },
        types: SendAssetTypes2,
        primaryType: "HyperliquidTransaction:SendAsset",
        message: action,
        signature: {
          r: exactPayload.signature.r,
          s: exactPayload.signature.s,
          yParity: exactPayload.signature.v - 27
        }
      });
    } catch {
      return {
        isValid: false,
        invalidReason: "invalid_exact_hl_payload_signature"
      };
    }
    if (getAddress(recoveredPayer) !== getAddress(exactPayload.user)) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_hl_payload_signer_mismatch"
      };
    }
    return { isValid: true, payer: getAddress(recoveredPayer) };
  }
  async settle(payload, requirements) {
    const verification = await this.verifyPayment(payload, requirements, {
      enforceTtl: false
    });
    if (!verification.isValid) {
      return {
        success: false,
        errorReason: verification.invalidReason,
        transaction: "",
        network: requirements.network,
        payer: verification.payer
      };
    }
    const parsed = ExactHyperliquidPayloadSchema.safeParse(payload.payload);
    if (!parsed.success) {
      return {
        success: false,
        errorReason: "invalid_exact_hl_payload",
        transaction: "",
        network: requirements.network,
        payer: verification.payer
      };
    }
    const payer = verification.payer;
    if (!payer) {
      return {
        success: false,
        errorReason: "invalid_exact_hl_payload_signature",
        transaction: "",
        network: requirements.network
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
      requirements.maxTimeoutSeconds
    );
    const settlement = this.settleVerified(exactPayload, requirements, payer, ttlValid).then((response) => {
      if (response.success) {
        this.cacheSettlement(idempotencyKey, response);
      }
      return response;
    }).finally(() => {
      this.pendingSettlements.delete(idempotencyKey);
    });
    this.pendingSettlements.set(idempotencyKey, settlement);
    return settlement;
  }
  async settleVerified(exactPayload, requirements, payer, ttlValid) {
    const endpoint = getExchangeBaseUrl(requirements.network);
    const infoClient = createInfoClient(requirements.network);
    try {
      const existingHash = await this.findConfirmedTransaction(
        infoClient,
        payer,
        exactPayload,
        requirements,
        ttlValid ? 1 : PRE_SUBMIT_RECONCILIATION_ATTEMPTS
      );
      if (existingHash) {
        return {
          success: true,
          transaction: existingHash,
          network: requirements.network,
          payer,
          amount: requirements.amount
        };
      }
      if (!this.validateTtl(
        exactPayload.action.nonce,
        requirements.maxTimeoutSeconds
      )) {
        return {
          success: false,
          errorReason: "payment_expired",
          transaction: "",
          network: requirements.network,
          payer
        };
      }
      let submissionFailed = false;
      try {
        await this.submitToExchange(endpoint, exactPayload);
      } catch {
        submissionFailed = true;
      }
      const matchedHash = await this.findConfirmedTransaction(
        infoClient,
        payer,
        exactPayload,
        requirements
      );
      if (matchedHash) {
        return {
          success: true,
          transaction: matchedHash,
          network: requirements.network,
          payer,
          amount: requirements.amount
        };
      }
      return {
        success: false,
        errorReason: submissionFailed ? "hl_exchange_error" : "hl_transfer_not_confirmed",
        transaction: "",
        network: requirements.network,
        payer
      };
    } catch {
      return {
        success: false,
        errorReason: "hl_exchange_error",
        transaction: "",
        network: requirements.network,
        payer
      };
    }
  }
  async submitToExchange(endpoint, payload) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: payload.action,
        signature: payload.signature,
        nonce: payload.nonce
      })
    });
    const responseText = await response.text();
    const body = this.parseExchangeResponse(responseText);
    if (!response.ok) {
      throw new Error(
        `hyperliquid_exchange_failed status=${response.status} body=${this.exchangeErrorBody(body)}`
      );
    }
    if (body?.status !== "ok") {
      throw new Error(`hyperliquid_exchange_failed body=${this.exchangeErrorBody(body)}`);
    }
    return body;
  }
  parseExchangeResponse(responseText) {
    try {
      return JSON.parse(responseText);
    } catch {
      return { status: "err", response: responseText };
    }
  }
  exchangeErrorBody(body) {
    try {
      return JSON.stringify(body).slice(0, 500);
    } catch {
      return String(body).slice(0, 500);
    }
  }
  async confirmTransaction(hash, payer, payload, requirements) {
    for (let i = 0; i < 3; i++) {
      try {
        const tx = await fetchTransactionDetails(
          requirements.network,
          hash
        );
        if (tx.error != null || tx.user.toLowerCase() !== payer.toLowerCase()) {
          return false;
        }
        const action = tx.action;
        const expected = payload.action;
        const decimals = await this.resolveDecimals(requirements);
        return action.type === "sendAsset" && action.signatureChainId === expected.signatureChainId && action.hyperliquidChain === expected.hyperliquidChain && typeof action.destination === "string" && action.destination.toLowerCase() === expected.destination.toLowerCase() && typeof action.token === "string" && this.tokenMatchesRequirements(action.token, expected.token) && typeof action.amount === "string" && this.decimalAmountsEqual(action.amount, expected.amount, decimals) && action.nonce === expected.nonce;
      } catch {
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    return false;
  }
  async findConfirmedTransaction(client, payer, payload, requirements, attempts) {
    const action = payload.action;
    const destination = typeof action.destination === "string" ? action.destination : void 0;
    const token = typeof action.token === "string" ? action.token : void 0;
    const amount = typeof action.amount === "string" ? action.amount : void 0;
    if (!destination || !token || !amount) return void 0;
    const decimals = await this.resolveDecimals(requirements);
    const startTime = Math.max(0, payload.nonce - MATCH_LOOKBACK_MS);
    const deadline = attempts === void 0 ? Date.now() + POST_SUBMIT_CONFIRMATION_TIMEOUT_MS : void 0;
    let attempt = 0;
    while (attempts === void 0 ? attempt === 0 || Date.now() < deadline : attempt < attempts) {
      attempt += 1;
      try {
        const updates = await client.userNonFundingLedgerUpdates({
          user: payer,
          startTime,
          endTime: Date.now() + MATCH_LOOKAHEAD_MS
        });
        const candidates = updates.filter(
          (update) => this.ledgerUpdateMatchesPayment(update, {
            payer,
            destination,
            token,
            amount,
            requirements,
            decimals,
            nonce: this.paymentNonce(payload)
          })
        );
        for (const candidate of candidates) {
          if (/^0x[0-9a-fA-F]{64}$/.test(candidate.hash) && await this.confirmTransaction(
            candidate.hash,
            payer,
            payload,
            requirements
          )) {
            return candidate.hash;
          }
        }
      } catch {
      }
      if (attempts !== void 0) {
        if (attempt >= attempts) break;
        await new Promise((r) => setTimeout(r, MATCH_RETRY_DELAY_MS));
        continue;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await new Promise(
        (r) => setTimeout(r, Math.min(MATCH_RETRY_DELAY_MS, remaining))
      );
    }
    return void 0;
  }
  settlementKey(network, payload) {
    const action = payload.action;
    const destination = typeof action.destination === "string" ? action.destination.toLowerCase() : "";
    const token = typeof action.token === "string" ? action.token.toLowerCase() : "";
    const amount = typeof action.amount === "string" ? action.amount : "";
    return [
      network,
      payload.user.toLowerCase(),
      String(payload.nonce),
      destination,
      token,
      amount
    ].join(":");
  }
  getCachedSettlement(key) {
    const cached = this.settledCache.get(key);
    if (!cached) return void 0;
    if (cached.expiresAt <= Date.now()) {
      this.settledCache.delete(key);
      return void 0;
    }
    return { ...cached.response };
  }
  cacheSettlement(key, response) {
    this.settledCache.set(key, {
      expiresAt: Date.now() + SETTLEMENT_CACHE_TTL_MS,
      response: { ...response }
    });
  }
  ledgerUpdateMatchesPayment(update, expected) {
    const delta = update.delta;
    if (!delta.user || !delta.destination || !delta.token || !delta.amount) return false;
    const exactSend = delta.type === "send" && delta.sourceDex === "spot" && delta.destinationDex === "spot" && delta.nonce === expected.nonce;
    const spotTransfer = delta.type === "spotTransfer" && delta.nonce == null && delta.sourceDex == null && delta.destinationDex == null;
    if (!exactSend && !spotTransfer) return false;
    if (expected.nonce != null && (update.time < expected.nonce - MAX_CLOCK_SKEW_MS || update.time > expected.nonce + expected.requirements.maxTimeoutSeconds * 1e3 + MATCH_WINDOW_LATE_GRACE_MS)) {
      return false;
    }
    if (delta.user.toLowerCase() !== expected.payer.toLowerCase()) return false;
    if (delta.destination.toLowerCase() !== expected.destination.toLowerCase()) return false;
    if (!this.ledgerTokenMatches(delta.token, expected.token, expected.requirements.asset))
      return false;
    return this.decimalAmountsEqual(delta.amount, expected.amount, expected.decimals);
  }
  ledgerTokenMatches(ledgerToken, payloadToken, requiredAsset) {
    if (this.tokenMatchesRequirements(ledgerToken, payloadToken)) return true;
    if (this.tokenMatchesRequirements(ledgerToken, requiredAsset)) return true;
    const ledgerSymbol = this.extractTokenSymbol(ledgerToken);
    return Boolean(
      ledgerSymbol && (ledgerSymbol === this.extractTokenSymbol(payloadToken) || ledgerSymbol === this.extractTokenSymbol(requiredAsset))
    );
  }
  extractTokenSymbol(asset) {
    const symbol = asset.split(":")[0]?.trim();
    return symbol ? symbol.toLowerCase() : void 0;
  }
  decimalAmountsEqual(left, right, decimals) {
    if (decimals != null && decimals >= 0) {
      try {
        return this.decimalToAtomic(left, decimals) === this.decimalToAtomic(right, decimals);
      } catch {
        return false;
      }
    }
    return this.normalizeDecimal(left) === this.normalizeDecimal(right);
  }
  normalizeDecimal(value) {
    return value.trim().replace(/^0+(?=\d)/, "").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  }
  async resolveDecimals(req) {
    if (typeof req.extra?.decimals === "number") return req.extra.decimals;
    const tokenId = this.extractTokenId(req.asset);
    if (!tokenId) return void 0;
    try {
      const info = await fetchHyperliquidTokenInfo(req.network, tokenId);
      return info.decimals;
    } catch {
      return void 0;
    }
  }
  extractTokenId(asset) {
    if (!asset) return void 0;
    const parts = asset.split(":");
    return parts.length === 2 ? parts[1] : parts[0]?.startsWith("0x") ? parts[0] : void 0;
  }
  tokenMatchesRequirements(payloadToken, requiredAsset) {
    if (payloadToken === requiredAsset) return true;
    const payloadTokenId = this.extractTokenId(payloadToken)?.toLowerCase();
    const requiredTokenId = this.extractTokenId(requiredAsset)?.toLowerCase();
    return Boolean(payloadTokenId && requiredTokenId && payloadTokenId === requiredTokenId);
  }
  paymentRequirementsMatch(accepted, required) {
    if (typeof accepted.payTo !== "string" || typeof required.payTo !== "string") {
      return false;
    }
    return accepted.scheme === required.scheme && accepted.network === required.network && accepted.asset === required.asset && accepted.amount === required.amount && accepted.payTo.toLowerCase() === required.payTo.toLowerCase() && accepted.maxTimeoutSeconds === required.maxTimeoutSeconds;
  }
  validateAmount(payloadAmount, requiredAmount, decimals) {
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
  decimalToAtomic(value, decimals) {
    const match = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
    if (!match) throw new Error("invalid decimal amount");
    const [, whole, fraction = ""] = match;
    if (/[1-9]/.test(fraction.slice(decimals))) {
      throw new Error("decimal amount exceeds token precision");
    }
    const normalizedFraction = fraction.slice(0, decimals).padEnd(decimals, "0");
    return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(normalizedFraction || "0");
  }
  validateTtl(actionTime, maxTimeoutSeconds) {
    if (typeof actionTime !== "number") return false;
    const now = Date.now();
    return actionTime <= now + MAX_CLOCK_SKEW_MS && now <= actionTime + maxTimeoutSeconds * 1e3;
  }
  paymentNonce(payload) {
    return payload.action.nonce;
  }
};

// src/exact/server/scheme.ts
import { convertToTokenAmount, numberToDecimalString } from "@x402/core/utils";
var ExactHyperliquidScheme3 = class {
  scheme = "exact";
  async parsePrice(price, network) {
    const config = HyperliquidNetworkConfigs[network];
    if (!config) throw new Error(`Unsupported Hyperliquid network: ${network}`);
    if (typeof price === "string") {
      const numericValue = price.replace(/[$,]/g, "").trim();
      const atomicAmount = convertToTokenAmount(numericValue, config.decimals);
      return {
        amount: atomicAmount,
        asset: config.token,
        extra: { decimals: config.decimals, tokenSymbol: "USDC" }
      };
    }
    if (typeof price === "number") {
      const atomicAmount = convertToTokenAmount(numberToDecimalString(price), config.decimals);
      return {
        amount: atomicAmount,
        asset: config.token,
        extra: { decimals: config.decimals, tokenSymbol: "USDC" }
      };
    }
    return price;
  }
  async enhancePaymentRequirements(requirements, supportedKind, _facilitatorExtensions) {
    const config = HyperliquidNetworkConfigs[requirements.network];
    return {
      ...requirements,
      extra: {
        ...requirements.extra,
        ...supportedKind.extra,
        decimals: config?.decimals ?? requirements.extra?.decimals,
        signatureChainId: config?.signatureChainId
      }
    };
  }
  getAssetDecimals(_asset, network) {
    const config = HyperliquidNetworkConfigs[network];
    if (!config) throw new Error(`Unsupported Hyperliquid network: ${network}`);
    return config.decimals;
  }
};
export {
  ExactHyperliquidScheme as ClientScheme,
  ExactHyperliquidPayloadSchema,
  ExactHyperliquidScheme2 as FacilitatorScheme,
  HYPERLIQUID_MAINNET,
  HYPERLIQUID_TESTNET,
  HYPERLIQUID_WILDCARD_CAIP2,
  HyperliquidErrorReasons,
  HyperliquidNetworkConfigs,
  HyperliquidNetworkToChainName,
  HyperliquidTokenIdRegex,
  ExactHyperliquidScheme3 as ServerScheme,
  SupportedHyperliquidNetworks,
  assertHyperliquidNetwork,
  createInfoClient,
  fetchHyperliquidTokenInfo,
  fetchTransactionDetails,
  getExchangeBaseUrl,
  getHyperliquidChainName,
  isHyperliquidNetwork,
  toClientHyperliquidSigner
};
//# sourceMappingURL=index.js.map