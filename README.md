# x402-hl

Standalone Hyperliquid primitives for x402.

This package factors the local Peezy fork implementation into a separate nested
repository that depends on upstream x402 packages instead of importing from
`../fork`.

## Exports

- `x402-hl`: constants, types, signer helpers, utilities, and exact scheme aliases.
- `x402-hl/exact/client`: `ExactHyperliquidScheme` for browser or server clients.
- `x402-hl/exact/server`: `ExactHyperliquidScheme` for resource servers.
- `x402-hl/exact/facilitator`: `ExactHyperliquidScheme` for local facilitators.
- `x402-hl/paywall`: `hyperliquidPaywall`, compatible with `@x402/paywall`.

## Environment

The package itself does not read secrets. Applications should provide recipient
addresses and optional payer credentials through their own environment variables.

## Build

```sh
pnpm install
pnpm build
pnpm typecheck
```
