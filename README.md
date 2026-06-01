# x402-hl

Standalone Hyperliquid primitives for x402.

This package provides the supported Hyperliquid integration path for x402
without carrying a fork of the upstream x402 repository.

## Exports

- `x402-hl`: constants, types, signer helpers, utilities, and exact scheme aliases.
- `x402-hl/exact/client`: `ExactHyperliquidScheme` for browser or server clients.
- `x402-hl/exact/server`: `ExactHyperliquidScheme` for resource servers.
- `x402-hl/exact/facilitator`: `ExactHyperliquidScheme` for facilitators.
- `x402-hl/paywall`: `hyperliquidPaywall`, compatible with `@x402/paywall`.

## Environment

The package itself does not read secrets. Applications should provide recipient
addresses and optional payer credentials through their own environment variables.

## Compatibility

`x402-hl` is designed to compose with upstream x402 packages instead of carrying
a fork. Current compatibility probes:

| Upstream surface | Status | Notes |
| --- | --- | --- |
| `@x402/extensions/payment-identifier` | Works | Client adds the identifier through a small `ClientExtension`; the Hyperliquid exact payload is unchanged. |
| `@x402/extensions/offer-receipt` | Works | Offers and receipts sign/verify around `x402-hl` payment requirements and settlement responses. |
| `@x402/axios` MCP-style paid client | Works | `wrapAxiosWithPayment` can retry an MCP-style tool request with a Hyperliquid `PAYMENT-SIGNATURE`. |
| `@x402/extensions/sign-in-with-x` with `hyperliquid:testnet` auth | Does not work directly | Upstream SIWX only supports EVM auth on `eip155:*` and Solana auth on `solana:*`. |
| `@x402/extensions/sign-in-with-x` with split auth | Works | Keep payment requirements on `hyperliquid:testnet`, but declare SIWX auth metadata on an EIP-155 chain such as `eip155:42161`. |

For SIWX, Hyperliquid payments are still signed as Hyperliquid spot transfer
actions. The SIWX authentication challenge should use the injected EVM wallet
identity on an EIP-155 network. In practice, use Arbitrum:

```ts
declareSIWxExtension({
  network: "eip155:42161",
  resourceUri: "https://example.com/x402/api/paid",
});
```

The generic `createSIWxClientExtension` plus `x402HTTPClient` path can produce
the split-network SIWX header. The upstream `wrapFetchWithSIWx` helper currently
does not auto-retry this shape because it matches SIWX supported chains against
the payment network.

## Examples

The compatibility examples are runnable package-level probes:

```sh
pnpm compat:payment-identifier
pnpm compat:offer-receipt
pnpm compat:siwx
pnpm compat:mcp-axios
pnpm compat:all
```

`pnpm compat:mcp-axios -- --real` can call a real paid API when
`HYPERLIQUID_MCP_PAYER_PRIVATE_KEY` or `HYPERLIQUID_PAYER_PRIVATE_KEY` is set.
The payer account must already hold enough Hyperliquid testnet spot USDC.

## Guides

- [Production sample](./docs/production-sample.md): a deployed reference shape
  for an app that accepts Hyperliquid x402 payments.
- [Facilitator integration](./docs/facilitator.md): register Hyperliquid
  verification and settlement with upstream `@x402/core`.
- [Accept Hyperliquid payments](./docs/endpoint.md): configure an x402 endpoint
  that accepts `hyperliquid:testnet`.

## Build

```sh
pnpm install
pnpm build
pnpm typecheck
```
