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
- Optional intent declarations: `createIntentDeclaration(intent, { required:
  false })` lets the client extension send a plain payment when the selected
  requirement carries no intent commitment; required declarations still refuse
  unbound selections.
- `recover(intentHash)` on the intent executor resumes records abandoned
  mid-transition (for example by a process crash): pre-submission states are
  driven to a refund and post-submission states park in `manual_intervention`.
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
- Exact-scheme `settle()` is now idempotent across restarts: it reconciles
  against confirmed ledger updates before submitting, so re-presenting an
  already-settled payment payload returns `success: true` with the original
  transaction hash instead of failing with `hl_exchange_error` on the
  exchange's duplicate-nonce rejection (the 0.1.x behavior). Integrators who
  treated a settle failure as their replay boundary must deduplicate on the
  returned transaction or payload nonce instead.

### Security

- Payment requirements, quote template, application, gateway, calldata,
  recipient, limits, and signer are checked as one binding before execution.
- Intent text commitments (`applicationHash`, `nonceHash`, `quoteId`) now hash
  UTF-8 bytes explicitly (`stringToBytes`) instead of `toBytes`, which
  hex-decoded `0x`-prefixed text and let two distinct text values (for example
  the nonce `"A"` and the nonce `"0x41"`) produce identical EIP-712
  commitments.
- `executor.execute` defers only the deadline check of paid-intent verification
  to the durable state machine: a payment that settles after the signed
  deadline lapses is registered as `paid` and driven to an automated refund,
  instead of throwing with no durable record of the settled payment. Standalone
  `verifyPaidExecutionIntent` still rejects expired intents by default; the new
  `enforceDeadline: false` input opts out.
- A second settled transaction for the same signed intent is now atomically
  retained as a payment-keyed refund record and refunded without re-executing.
  Store adapters must add `getPayment` and payment-keyed transitions.
- Reuse of one payment transaction by different intents, duplicate quotes,
  execution transactions, and refund transactions remain explicit conflicts.
- Uncertain execution or refund outcomes move to `manual_intervention` instead
  of being retried or refunded automatically.
- The executor rechecks the signed deadline after policy and simulation,
  directly before invoking destination execution.
- Settlement reconciliation accepts both nonce-bearing `send` and public
  `spotTransfer` ledger candidates, but still requires the explorer action to
  match the exact signed `sendAsset` nonce and fields.
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
