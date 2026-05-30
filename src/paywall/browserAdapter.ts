import type { ClientHyperliquidSigner } from "../signer";
import type { Account, WalletClient } from "viem";

type TypedDataMessage = {
  domain: Parameters<WalletClient["signTypedData"]>[0]["domain"];
  types: Parameters<WalletClient["signTypedData"]>[0]["types"];
  primaryType: Parameters<WalletClient["signTypedData"]>[0]["primaryType"];
  message: Parameters<WalletClient["signTypedData"]>[0]["message"];
};

/**
 * Converts a wagmi/viem WalletClient to the signer shape accepted by
 * x402-hl.
 *
 * @param walletClient - The wagmi wallet client from useWalletClient().
 * @returns ClientHyperliquidSigner compatible with ExactHyperliquidScheme.
 */
export function wagmiToHyperliquidSigner(walletClient: WalletClient): ClientHyperliquidSigner {
  if (!walletClient.account) {
    throw new Error("Wallet client must have an account");
  }

  return {
    address: walletClient.account.address,
    account: {
      address: walletClient.account.address,
    },
    signTypedData: async (message: TypedDataMessage) => {
      return walletClient.signTypedData({
        account: walletClient.account as Account,
        domain: message.domain,
        types: message.types,
        primaryType: message.primaryType,
        message: message.message,
      });
    },
  } as ClientHyperliquidSigner;
}
