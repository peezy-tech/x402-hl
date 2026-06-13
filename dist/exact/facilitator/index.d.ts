export { E as ExactHyperliquidScheme } from '../../scheme-Bt-4D1uk.js';
import { x402Facilitator } from '@x402/core/facilitator';
import { d as HyperliquidNetwork } from '../../constants-NCiqgml9.js';
import '@x402/core/types';

interface HyperliquidFacilitatorConfig {
    networks?: HyperliquidNetwork[];
}
declare function registerExactHyperliquidScheme(facilitator: x402Facilitator, config?: HyperliquidFacilitatorConfig): x402Facilitator;

export { type HyperliquidFacilitatorConfig, registerExactHyperliquidScheme };
