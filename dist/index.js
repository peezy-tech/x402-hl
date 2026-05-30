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
    decimals: 6,
    signatureChainId: toHex(arbitrum.id)
  },
  [HYPERLIQUID_MAINNET]: {
    token: "USDC:0xeb62eee3685fc4c43992febcd9e75443",
    decimals: 6,
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
var HyperliquidTokenIdRegex = /^[A-Za-z0-9]+:0x[0-9a-fA-F]{32,40}$/;
var EvmSignatureRegex = /^0x[0-9a-fA-F]+$/;
var EvmAddressRegex = /^0x[0-9a-fA-F]{40}$/;
var ExactHyperliquidPayloadSchema = z.object({
  action: z.record(z.any()),
  signature: z.union([
    z.string().regex(EvmSignatureRegex),
    z.object({
      r: z.string().regex(EvmSignatureRegex),
      s: z.string().regex(EvmSignatureRegex),
      v: z.number().int()
    })
  ]),
  nonce: z.number().int().positive(),
  user: z.string().regex(EvmAddressRegex)
});
var HyperliquidErrorReasons = [
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
  "hl_tx_unconfirmed"
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
async function fetchTransactionDetails(client, hash) {
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
import { parser, SpotSendRequest, SpotSendTypes } from "@nktkas/hyperliquid/api/exchange";
import { signUserSignedAction } from "@nktkas/hyperliquid/signing";
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
    const request = parser(SpotSendRequest)({
      action: {
        type: "spotSend",
        signatureChainId: toHex2(arbitrum2.id),
        hyperliquidChain: getHyperliquidChainName(paymentRequirements.network),
        destination: paymentRequirements.payTo,
        token: await this.resolveTokenString(paymentRequirements),
        amount: this.formatDecimalAmount(paymentRequirements.amount, decimals),
        time: nonce
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
      types: SpotSendTypes
    });
    const payload = {
      action: request.action,
      signature,
      nonce,
      user: signerAddress
    };
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
var SETTLEMENT_CACHE_TTL_MS = 5 * 60 * 1e3;
var MATCH_LOOKBACK_MS = 5 * 1e3;
var MATCH_LOOKAHEAD_MS = 30 * 1e3;
var MATCH_ATTEMPTS = 5;
var MATCH_RETRY_DELAY_MS = 500;
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
    if (payload.x402Version !== 2) {
      return { isValid: false, invalidReason: "invalid_x402_version" };
    }
    if (payload.accepted?.scheme !== "exact" || requirements.scheme !== "exact") {
      return { isValid: false, invalidReason: "unsupported_scheme" };
    }
    if (payload.accepted?.network !== requirements.network) {
      return { isValid: false, invalidReason: "network_mismatch" };
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
    if (!action || typeof action !== "object") {
      return { isValid: false, invalidReason: "invalid_exact_hl_payload" };
    }
    const destination = action.destination;
    const token = action.token;
    const amount = action.amount;
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
    const actionTime = action.time;
    if (!this.validateTtl(actionTime, requirements.maxTimeoutSeconds)) {
      return { isValid: false, invalidReason: "payment_expired" };
    }
    return { isValid: true, payer: exactPayload.user };
  }
  async settle(payload, requirements) {
    const parsed = ExactHyperliquidPayloadSchema.safeParse(payload.payload);
    const payer = parsed.success ? parsed.data.user : void 0;
    const verification = await this.verify(payload, requirements);
    if (!verification.isValid) {
      return {
        success: false,
        errorReason: verification.invalidReason,
        transaction: "",
        network: requirements.network,
        payer
      };
    }
    if (!parsed.success) {
      return {
        success: false,
        errorReason: "invalid_exact_hl_payload",
        transaction: "",
        network: requirements.network,
        payer
      };
    }
    const exactPayload = parsed.data;
    const idempotencyKey = this.settlementKey(requirements.network, exactPayload);
    const cached = this.getCachedSettlement(idempotencyKey);
    if (cached) return cached;
    const pending = this.pendingSettlements.get(idempotencyKey);
    if (pending) return pending;
    const settlement = this.settleVerified(exactPayload, requirements, exactPayload.user).then((response) => {
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
  async settleVerified(exactPayload, requirements, payer) {
    const endpoint = getExchangeBaseUrl(requirements.network);
    const infoClient = createInfoClient(requirements.network);
    try {
      const exchangeResponse = await this.submitToExchange(endpoint, exactPayload);
      const exchangeTxHash = exchangeResponse?.response?.txHash ?? exchangeResponse?.hash;
      const matchedHash = payer ? await this.findMatchingTransaction(infoClient, payer, exactPayload, requirements) : void 0;
      const txHash = matchedHash ?? exchangeTxHash;
      if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
        return {
          success: false,
          errorReason: "hl_tx_not_found",
          transaction: txHash ?? "",
          network: requirements.network,
          payer
        };
      }
      const confirmed = await this.confirmTransaction(infoClient, txHash);
      if (!confirmed) {
        return {
          success: false,
          errorReason: "hl_tx_unconfirmed",
          transaction: txHash,
          network: requirements.network,
          payer
        };
      }
      return {
        success: true,
        transaction: txHash,
        network: requirements.network,
        payer
      };
    } catch (error) {
      console.error("Hyperliquid settle error:", error);
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
    if (!response.ok) throw new Error("hyperliquid_exchange_failed");
    const body = await response.json();
    if (body?.status !== "ok") throw new Error("hyperliquid_exchange_failed");
    return body;
  }
  async confirmTransaction(client, hash) {
    for (let i = 0; i < 3; i++) {
      try {
        const tx = await fetchTransactionDetails(client, hash);
        return tx.error == null;
      } catch {
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    return false;
  }
  async findMatchingTransaction(client, payer, payload, requirements) {
    const action = payload.action;
    const destination = typeof action.destination === "string" ? action.destination : void 0;
    const token = typeof action.token === "string" ? action.token : void 0;
    const amount = typeof action.amount === "string" ? action.amount : void 0;
    if (!destination || !token || !amount) return void 0;
    const decimals = await this.resolveDecimals(requirements);
    const startTime = Math.max(0, payload.nonce - MATCH_LOOKBACK_MS);
    for (let attempt = 0; attempt < MATCH_ATTEMPTS; attempt++) {
      try {
        const updates = await client.userNonFundingLedgerUpdates({
          user: payer,
          startTime,
          endTime: Date.now() + MATCH_LOOKAHEAD_MS
        });
        const match = updates.find(
          (update) => this.ledgerUpdateMatchesPayment(update, {
            payer,
            destination,
            token,
            amount,
            requirements,
            decimals
          })
        );
        if (match) return match.hash;
      } catch {
      }
      if (attempt < MATCH_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, MATCH_RETRY_DELAY_MS));
      }
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
    if (delta.type !== "spotTransfer") return false;
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
  validateAmount(payloadAmount, requiredAmount, decimals) {
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
  decimalToAtomic(value, decimals) {
    const [whole, fraction = ""] = value.trim().split(".");
    const normalizedFraction = fraction.padEnd(decimals, "0").slice(0, decimals);
    return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(normalizedFraction || "0");
  }
  validateTtl(actionTime, maxTimeoutSeconds) {
    if (typeof actionTime !== "number") return false;
    return Date.now() <= actionTime + maxTimeoutSeconds * 1e3;
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