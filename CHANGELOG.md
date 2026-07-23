# Changelog

Notable changes to `x402-hl` are recorded here.

## [0.2.0] - Unreleased

### Added

- Version-2 brokered HyperEVM execution intents under `x402-hl/intents`,
  `x402-hl/intents/client`, and `x402-hl/intents/server`.
- Required application and gateway deployment domains.
- Canonical hashing of the complete finalized x402 `PaymentRequirements`.
- Intent-template commitments for quotes and final EIP-712 signatures bound to
  the selected payment requirements.
- Strict paid-intent verification requiring a successful settlement, payer,
  payment transaction, expected domain, expected quote id, and expected intent
  template hash.
- Asynchronous durable-store contract with atomic paid registration,
  uniqueness constraints, revision/status/claim-token compare-and-swap, and
  execution/refund transaction deduplication.
- Brokered execution state machine covering claimed, submitted, confirmed,
  failed, refund, and manual-intervention outcomes.
- Required policy, simulation, confirmed execution, and confirmed refund
  adapters.
- Complete public intents API reference, production gateway guide, network
  evidence matrix, inventory guidance, and expanded release validation.

### Changed

- Execution intents are brokered-only. The unpublished version-1
  `contract` and `smart-account` mode placeholders are not accepted.
- Intent version, EIP-712 domain name/version, message shape, and signed payload
  are version 2 and are incompatible with the unpublished version-1 draft.
- `createExecutionIntentClientExtension` now requires a trusted
  `{ application, gateway }` domain and either an exact intent/resolver or an
  explicit approval callback.
- `signExecutionIntent` requires finalized payment requirements or their
  canonical hash.
- `verifyPaidExecutionIntent` requires expected domain, quote id, template
  hash, and confirmed settlement evidence.
- `createIntentExecutor` requires a durable store plus policy, simulation,
  execution, and refund adapters. The in-memory store is development/test only.

### Security

- Payment requirements, quote template, application, gateway, calldata,
  recipient, limits, and signer are checked as one binding before execution.
- Duplicate quotes, payments, execution transactions, and refunds are explicit
  store conflicts.
- Uncertain execution or refund outcomes move to `manual_intervention` instead
  of being retried or refunded automatically.
- Production guidance now requires canonical ABI decoding, exact target and
  selector allowlists, current-state simulation, confirmed receipts, durable
  idempotency, pre-funded HyperEVM inventory, and separately reserved refund
  liquidity.

### Evidence Status

- The code supports `hyperliquid:testnet` and `hyperliquid:mainnet`.
- Successful funded x402 settlements are recorded on testnet on 2026-06-09
  (`0xbf6176…`) and 2026-06-12 (`0xf53e86…`).
- No successful funded mainnet settlement is recorded. A 2026-06-13 attempt
  failed with `hl_exchange_error`.
- No funded version-2 HyperEVM execution-intent smoke is recorded on either
  network. This section must be updated only from new transaction evidence.

## [0.1.2] - 2026-06-13

- Switched exact payments to Hyperliquid `sendAsset`.
- Corrected Hyperliquid USDC network configuration.
- Confirmed settlement through matching non-funding ledger updates.
- Added the npm trusted-publishing workflow and release checklist.

## [0.1.1] - 2026-06-03

- Added standalone integration guides and the Tome documentation site.

## [0.1.0] - 2026-05-30

- Initial standalone `x402-hl` package release.
