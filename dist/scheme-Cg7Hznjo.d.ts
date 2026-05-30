import { SchemeNetworkClient, PaymentRequirements, PaymentPayload } from '@x402/core/types';
import { LocalAccount, WalletClient } from 'viem';
import { signUserSignedAction } from '@nktkas/hyperliquid/signing';

type WalletWithAddress = {
    address?: string;
    account?: {
        address?: string;
    };
};
type ClientHyperliquidSigner = (Parameters<typeof signUserSignedAction>[0]["wallet"] | LocalAccount | WalletClient) & WalletWithAddress;
interface FacilitatorHyperliquidSigner {
}
declare function toClientHyperliquidSigner(wallet: ClientHyperliquidSigner): ClientHyperliquidSigner;

declare class ExactHyperliquidScheme implements SchemeNetworkClient {
    private readonly signer;
    readonly scheme = "exact";
    constructor(signer: ClientHyperliquidSigner);
    createPaymentPayload(x402Version: number, paymentRequirements: PaymentRequirements): Promise<Pick<PaymentPayload, "x402Version" | "payload">>;
    private getSignerAddress;
    private formatDecimalAmount;
    private resolveDecimals;
    private resolveTokenString;
}

export { type ClientHyperliquidSigner as C, ExactHyperliquidScheme as E, type FacilitatorHyperliquidSigner as F, toClientHyperliquidSigner as t };
