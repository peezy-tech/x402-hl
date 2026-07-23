# x402-hl

Standalone Hyperliquid primitives for x402.

This package provides the supported Hyperliquid integration path for x402
without carrying a fork of the upstream x402 repository.

Docs: <https://peezy.tech/x402-hl/>

## Exports

- `x402-hl`: constants, types, signer helpers, utilities, and exact scheme aliases.
- `x402-hl/exact/client`: `ExactHyperliquidScheme` for browser or server clients.
- `x402-hl/exact/server`: `ExactHyperliquidScheme` for resource servers.
- `x402-hl/exact/facilitator`: `ExactHyperliquidScheme` for facilitators.
- `x402-hl/intents`: version-2 intent schemas, canonical payment hashing,
  EIP-712 signing, and extension helpers.
- `x402-hl/intents/client`: explicit application/gateway approval and signing
  bound to the exact finalized payment requirements.
- `x402-hl/intents/server`: quote, post-settlement verification, durable
  compare-and-swap storage, constrained execution, status, and refund helpers.
- `x402-hl/paywall`: `hyperliquidPaywall`, compatible with `@x402/paywall`.

The [execution-intent API reference](./docs/pages/intents.md#api-reference)
lists every public export and type from the three intents entry points.

## Environment

The package itself does not read secrets. Applications should provide recipient
addresses and optional payer credentials through their own environment variables.

Brokered intent gateways additionally need a stable application id and gateway
address, a destination-chain relayer, a durable store, execution and refund
inventory, and application-specific policy/simulation adapters.

## Networks And Evidence

| Payment network | Related HyperEVM chain | Code support | Funded evidence |
| --- | --- | --- | --- |
| `hyperliquid:testnet` | `eip155:998` | Yes | Successful funded x402 settlements were recorded on 2026-06-09 (`0xbf6176…`) and 2026-06-12 (`0xf53e86…`). |
| `hyperliquid:mainnet` | `eip155:999` | Yes | No successful funded settlement is recorded; a 2026-06-13 browser attempt failed with `hl_exchange_error`. |

Compatibility probes and mocked settlements do not transfer funds. No funded
HyperEVM execution-intent smoke is recorded on either network.

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

`x402-hl` currently ships TypeScript and JavaScript runtime support only. Other
x402 SDKs should document Hyperliquid as unsupported unless they add equivalent
Hyperliquid exact-scheme primitives.

## Examples

The compatibility examples are runnable package-level probes:

```sh
pnpm compat:payment-identifier
pnpm compat:offer-receipt
pnpm compat:siwx
pnpm compat:intents
pnpm compat:mcp-axios
pnpm compat:all
```

`pnpm compat:mcp-axios -- --real` can call a real paid API when
`HYPERLIQUID_MCP_PAYER_PRIVATE_KEY` or `HYPERLIQUID_PAYER_PRIVATE_KEY` is set.
The payer account must already hold enough Hyperliquid testnet spot USDC.

## Version-2 Execution Intents

Execution intents implement a non-atomic, brokered saga:

```txt
quote -> sign finalized payment + intent -> settle HyperCore payment
      -> verify -> durable claim -> policy/decode -> simulate
      -> confirmed HyperEVM execution or confirmed refund/manual intervention
```

Clients and gateways must independently configure the same
`{ application, gateway }` domain. The signature commits to the canonical hash
of the selected final `PaymentRequirements`. Servers must also provide the
locally persisted expected quote id and intent-template hash, and verification
requires a successful settlement with payer and transaction evidence.

Production use requires an asynchronous durable `IntentExecutionStore` with
atomic uniqueness and compare-and-swap transitions. The included
`InMemoryIntentExecutionStore` is for development and tests only.

The operator is trusted to maintain pre-funded HyperEVM execution inventory,
HyperCore refund liquidity, monitoring, and reconciliation. HyperCore receipts
do not become HyperEVM inventory automatically; bridge or transfer operations
are separate treasury rebalancing, not part of the paid request.

The repository also includes a standalone Express app at
[`examples/express`](./examples/express). It is intended for GitHub readers and
is not included in the npm package.

[`examples/intents/production.ts`](./examples/intents/production.ts) is the
typechecked, offline companion to the production intent guide. It demonstrates
the quote, payment identifier, signed intent, durable-store adapter boundary,
canonical policy, simulation, confirmed execution/refund, and safe logging
shape. Its deterministic adapter does not settle funds or submit to HyperEVM.

## Guides

- [Production sample](./docs/pages/production-sample.md): a durable brokered
  intent gateway with payment identifiers, canonical ABI policy, simulation,
  confirmed execution, refunds, and inventory guidance.
- [Facilitator integration](./docs/pages/facilitator.md): register Hyperliquid
  verification and settlement with upstream `@x402/core`.
- [Accept Hyperliquid payments](./docs/pages/endpoint.md): configure an x402 endpoint
  that accepts `hyperliquid:testnet`.
- [Execution intents](./docs/pages/intents.md): bind finalized HyperCore payment
  requirements to a signed, policy-constrained HyperEVM execution saga.

## Build

```sh
pnpm install
pnpm test
pnpm build
pnpm typecheck
pnpm example:express:typecheck
pnpm compat:all
pnpm docs:check
pnpm docs:build
```

Maintainers should use the repository `RELEASE_CHECKLIST.md` before publishing
a new package version.
