export { E as ExactHyperliquidScheme } from '../../scheme-BDAZzpLt.js';
import { x402ResourceServer } from '@x402/core/server';
import { d as HyperliquidNetwork } from '../../constants-NCiqgml9.js';
import '@x402/core/types';

interface HyperliquidServerConfig {
    networks?: HyperliquidNetwork[];
}
declare function registerExactHyperliquidScheme(server: x402ResourceServer, config?: HyperliquidServerConfig): x402ResourceServer;

export { type HyperliquidServerConfig, registerExactHyperliquidScheme };
