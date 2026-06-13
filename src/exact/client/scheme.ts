import { PaymentPayload, PaymentRequirements, SchemeNetworkClient } from "@x402/core/types";
import { parser, SendAssetRequest, SendAssetTypes } from "@nktkas/hyperliquid/api/exchange";
import { signUserSignedAction } from "@nktkas/hyperliquid/signing";
import { toHex } from "viem";
import { arbitrum } from "viem/chains";
import { ClientHyperliquidSigner } from "../../signer";
import { ExactHyperliquidPayload } from "../../types";
import {
  getHyperliquidChainName,
  fetchHyperliquidTokenInfo,
} from "../../utils";

export class ExactHyperliquidScheme implements SchemeNetworkClient {
  readonly scheme = "exact";

  constructor(private readonly signer: ClientHyperliquidSigner) {}

  async createPaymentPayload(
    x402Version: number,
    paymentRequirements: PaymentRequirements,
  ): Promise<Pick<PaymentPayload, "x402Version" | "payload">> {
    const signerAddress = this.getSignerAddress();
    const decimals = await this.resolveDecimals(paymentRequirements);
    const nonce = Date.now();

    const request = parser(SendAssetRequest)({
      action: {
        type: "sendAsset",
        signatureChainId: toHex(arbitrum.id),
        hyperliquidChain: getHyperliquidChainName(paymentRequirements.network),
        destination: paymentRequirements.payTo,
        sourceDex: "spot",
        destinationDex: "spot",
        token: await this.resolveTokenString(paymentRequirements),
        amount: this.formatDecimalAmount(paymentRequirements.amount, decimals),
        fromSubAccount: "",
        nonce,
      },
      nonce,
      signature: {
        r: "0x0000000000000000000000000000000000000000000000000000000000000000",
        s: "0x0000000000000000000000000000000000000000000000000000000000000000",
        v: 27,
      },
    });

    const signature = await signUserSignedAction({
      wallet: this.signer as Parameters<typeof signUserSignedAction>[0]["wallet"],
      action: request.action,
      types: SendAssetTypes,
    });

    const payload: ExactHyperliquidPayload = {
      action: request.action,
      signature,
      nonce,
      user: signerAddress,
    };

    return { x402Version, payload };
  }

  private getSignerAddress(): string {
    const address = this.signer.address ?? this.signer.account?.address;
    if (!address?.toLowerCase().startsWith("0x")) {
      throw new Error("Hyperliquid wallet missing address");
    }
    return address;
  }

  private formatDecimalAmount(amount: string, decimals?: number): string {
    if (typeof decimals !== "number" || decimals <= 0) return amount;
    const bigAmount = BigInt(amount);
    const divisor = 10n ** BigInt(decimals);
    const whole = bigAmount / divisor;
    const remainder = bigAmount % divisor;
    if (remainder === 0n) return whole.toString();
    const remainderStr = remainder.toString().padStart(decimals, "0").replace(/0+$/, "");
    return `${whole}.${remainderStr}`;
  }

  private async resolveDecimals(req: PaymentRequirements): Promise<number | undefined> {
    if (typeof req.extra?.decimals === "number") return req.extra.decimals;
    const tokenId = req.asset?.startsWith("0x") ? req.asset : undefined;
    if (!tokenId) return undefined;
    try {
      const info = await fetchHyperliquidTokenInfo(req.network, tokenId);
      return info.decimals;
    } catch { return undefined; }
  }

  private async resolveTokenString(req: PaymentRequirements): Promise<string> {
    if (req.asset.includes(":")) return req.asset;
    const symbol = typeof req.extra?.tokenSymbol === "string" ? req.extra.tokenSymbol : undefined;
    if (symbol) return `${symbol}:${req.asset}`;
    try {
      const info = await fetchHyperliquidTokenInfo(req.network, req.asset);
      if (info.symbol) return `${info.symbol}:${req.asset}`;
    } catch {}
    return `TOKEN:${req.asset}`;
  }
}
