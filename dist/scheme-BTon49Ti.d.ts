import { SchemeNetworkFacilitator, PaymentPayload, PaymentRequirements, VerifyResponse, SettleResponse } from '@x402/core/types';

declare class ExactHyperliquidScheme implements SchemeNetworkFacilitator {
    readonly scheme = "exact";
    readonly caipFamily = "hyperliquid:*";
    private readonly pendingSettlements;
    private readonly settledCache;
    getExtra(_: string): Record<string, unknown> | undefined;
    getSigners(_: string): string[];
    verify(payload: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyResponse>;
    settle(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse>;
    private settleVerified;
    private submitToExchange;
    private confirmTransaction;
    private findMatchingTransaction;
    private settlementKey;
    private getCachedSettlement;
    private cacheSettlement;
    private ledgerUpdateMatchesPayment;
    private ledgerTokenMatches;
    private extractTokenSymbol;
    private decimalAmountsEqual;
    private normalizeDecimal;
    private resolveDecimals;
    private extractTokenId;
    private tokenMatchesRequirements;
    private validateAmount;
    private decimalToAtomic;
    private validateTtl;
}

export { ExactHyperliquidScheme as E };
