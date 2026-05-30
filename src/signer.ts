import type { WalletClient, LocalAccount } from "viem";
import type { signUserSignedAction } from "@nktkas/hyperliquid/signing";

type WalletWithAddress = {
  address?: string;
  account?: { address?: string };
};

export type ClientHyperliquidSigner = (
  | Parameters<typeof signUserSignedAction>[0]["wallet"]
  | LocalAccount
  | WalletClient
) & WalletWithAddress;

export interface FacilitatorHyperliquidSigner {}

export function toClientHyperliquidSigner(wallet: ClientHyperliquidSigner): ClientHyperliquidSigner {
  return wallet;
}
