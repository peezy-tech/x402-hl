import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useConnect, useDisconnect, useWalletClient } from "wagmi";

import { x402Client } from "@x402/core/client";
import { encodePaymentSignatureHeader } from "@x402/core/http";
import type { PaymentRequired, PaymentRequirements } from "@x402/core/types";
import { ExactHyperliquidScheme } from "../exact/client";
import { Spinner } from "./Spinner";
import { wagmiToHyperliquidSigner } from "./browserAdapter";

type HyperliquidPaywallProps = {
  paymentRequired: PaymentRequired;
  onSuccessfulResponse: (response: Response) => Promise<void>;
};

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function amountFromRequirement(requirement: PaymentRequirements, fallback?: number): number {
  if (typeof fallback === "number" && Number.isFinite(fallback)) {
    return fallback;
  }

  const decimals =
    typeof requirement.extra?.decimals === "number" ? requirement.extra.decimals : 6;
  const legacyRequirement = requirement as PaymentRequirements & { maxAmountRequired?: string };
  const amount = requirement.amount ?? legacyRequirement.maxAmountRequired ?? "0";
  return Number(amount) / 10 ** decimals;
}

function getTokenSymbol(requirement: PaymentRequirements): string {
  return typeof requirement.extra?.tokenSymbol === "string"
    ? requirement.extra.tokenSymbol
    : "USDC";
}

function getNetworkLabel(network: string): string {
  return network === "hyperliquid:testnet" ? "Hyperliquid Testnet" : "Hyperliquid Mainnet";
}

/**
 * Paywall experience for Hyperliquid x402 payments.
 *
 * @param props - Component props.
 * @param props.paymentRequired - Payment required response with accepts array.
 * @param props.onSuccessfulResponse - Callback fired once the paid request succeeds.
 * @returns JSX element.
 */
export function HyperliquidPaywall({
  paymentRequired,
  onSuccessfulResponse,
}: HyperliquidPaywallProps) {
  const { address, isConnected } = useAccount();
  const { data: wagmiWalletClient } = useWalletClient();
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();

  const [status, setStatus] = useState<string>("");
  const [isPaying, setIsPaying] = useState(false);
  const [selectedConnectorId, setSelectedConnectorId] = useState<string>("");

  const x402 = window.x402;
  const firstRequirement = paymentRequired.accepts[0];

  if (!firstRequirement) {
    throw new Error("No payment requirements in paymentRequired.accepts");
  }

  const amount = useMemo(
    () => amountFromRequirement(firstRequirement, x402.amount),
    [firstRequirement, x402.amount],
  );
  const tokenName = getTokenSymbol(firstRequirement);
  const networkLabel = getNetworkLabel(firstRequirement.network);
  const description = paymentRequired.resource?.description;

  useEffect(() => {
    if (selectedConnectorId) {
      return;
    }

    const injectedConnector = connectors.find(
      connector =>
        connector.id === "injected" || connector.name.toLowerCase().includes("injected"),
    );

    if (injectedConnector) {
      setSelectedConnectorId(injectedConnector.id);
    } else if (connectors.length === 1) {
      setSelectedConnectorId(connectors[0].id);
    }
  }, [connectors, selectedConnectorId]);

  const handlePayment = useCallback(async () => {
    if (!x402) {
      return;
    }

    if (!address || !isConnected) {
      setStatus("Connect an injected wallet before paying.");
      return;
    }

    if (!wagmiWalletClient) {
      setStatus("Wallet client not available. Please reconnect your wallet.");
      return;
    }

    setIsPaying(true);

    try {
      setStatus("Creating Hyperliquid payment signature...");

      const signer = wagmiToHyperliquidSigner(wagmiWalletClient);
      const client = new x402Client();
      client.register("hyperliquid:*", new ExactHyperliquidScheme(signer));

      const paymentPayload = await client.createPaymentPayload(paymentRequired);
      const paymentHeader = encodePaymentSignatureHeader(paymentPayload);

      setStatus("Requesting protected content...");
      const response = await fetch(x402.currentUrl, {
        headers: {
          "PAYMENT-SIGNATURE": paymentHeader,
          "Access-Control-Expose-Headers": "PAYMENT-RESPONSE",
        },
      });

      if (response.ok) {
        await onSuccessfulResponse(response);
        return;
      }

      let detail = `${response.status} ${response.statusText}`.trim();
      try {
        const body = await response.json();
        if (typeof body?.error === "string") {
          detail = body.error;
        } else if (typeof body?.errorReason === "string") {
          detail = body.errorReason;
        }
      } catch {
        // Keep the HTTP status fallback when the error body is not JSON.
      }

      throw new Error(`Payment failed: ${detail}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Payment failed");
    } finally {
      setIsPaying(false);
    }
  }, [address, isConnected, onSuccessfulResponse, paymentRequired, wagmiWalletClient, x402]);

  if (!x402) {
    return null;
  }

  return (
    <div className="container gap-8">
      <div className="header">
        <h1 className="title">Hyperliquid Payment Required</h1>
        <p>
          {description && `${description}.`} Pay {amount} {tokenName} on {networkLabel} with an
          injected browser wallet.
        </p>
        <p className="instructions">
          Your wallet signs a Hyperliquid spot transfer action. No private key is sent to this
          page.
        </p>
      </div>

      <div className="content w-full">
        <div className="payment-details">
          <div className="payment-row">
            <span className="payment-label">Wallet:</span>
            <span className="payment-value">{address ? formatAddress(address) : "-"}</span>
          </div>
          <div className="payment-row">
            <span className="payment-label">Amount:</span>
            <span className="payment-value">
              {amount} {tokenName}
            </span>
          </div>
          <div className="payment-row">
            <span className="payment-label">Network:</span>
            <span className="payment-value">{networkLabel}</span>
          </div>
          <div className="payment-row">
            <span className="payment-label">Recipient:</span>
            <span className="payment-value">{formatAddress(firstRequirement.payTo)}</span>
          </div>
        </div>

        {!isConnected ? (
          <div className="cta-container">
            <select
              className="input"
              value={selectedConnectorId}
              onChange={event => setSelectedConnectorId((event.target as HTMLSelectElement).value)}
            >
              <option value="" disabled>
                Select a wallet
              </option>
              {connectors.map(connector => (
                <option value={connector.id} key={connector.id}>
                  {connector.name}
                </option>
              ))}
            </select>
            <button
              className="button button-primary"
              onClick={() => {
                const connector = connectors.find(c => c.id === selectedConnectorId);
                if (connector) {
                  connect({ connector });
                }
              }}
              disabled={!selectedConnectorId}
            >
              Connect wallet
            </button>
          </div>
        ) : (
          <div className="cta-container">
            <button className="button button-secondary" onClick={() => disconnect()}>
              Disconnect
            </button>
            <button className="button button-primary" onClick={handlePayment} disabled={isPaying}>
              {isPaying ? <Spinner /> : "Pay now"}
            </button>
          </div>
        )}

        {!connectors.length && (
          <div className="status">
            Install or unlock an injected EVM wallet, then refresh this paywall.
          </div>
        )}
        {status && <div className="status">{status}</div>}
      </div>
    </div>
  );
}
