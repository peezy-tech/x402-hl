import { x402Facilitator } from "@x402/core/facilitator";
import type { FacilitatorClient } from "@x402/core/server";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  SupportedResponse,
  VerifyResponse,
} from "@x402/core/types";
import { registerExactHyperliquidScheme } from "x402-hl/exact/facilitator";

const facilitator = registerExactHyperliquidScheme(new x402Facilitator(), {
  networks: ["hyperliquid:testnet"],
});

export class LocalHyperliquidFacilitatorClient implements FacilitatorClient {
  verify(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    return facilitator.verify(paymentPayload, paymentRequirements);
  }

  settle(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    return facilitator.settle(paymentPayload, paymentRequirements);
  }

  async getSupported(): Promise<SupportedResponse> {
    return facilitator.getSupported() as SupportedResponse;
  }
}
