import { SchemeNetworkServer, Price, Network, AssetAmount, PaymentRequirements } from '@x402/core/types';

declare class ExactHyperliquidScheme implements SchemeNetworkServer {
    readonly scheme = "exact";
    parsePrice(price: Price, network: Network): Promise<AssetAmount>;
    enhancePaymentRequirements(requirements: PaymentRequirements, supportedKind: {
        x402Version: number;
        scheme: string;
        network: Network;
        extra?: Record<string, unknown>;
    }, _facilitatorExtensions: string[]): Promise<PaymentRequirements>;
    getAssetDecimals(_asset: string, network: Network): number;
}

export { ExactHyperliquidScheme as E };
