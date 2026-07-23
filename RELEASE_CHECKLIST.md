# x402-hl Release Checklist

Use this checklist before publishing a new `x402-hl` package version. A passing
offline suite is not funded network evidence.

## 1. Scope And Version

- Start from a clean worktree and the exact commit intended for the tag.
- Confirm the package version, changelog heading, release notes, and tag agree.
  For this release they must resolve to `0.2.0` and `v0.2.0`.
- Review every public export and generated declaration for:
  - `x402-hl`;
  - `x402-hl/exact/client`, `/server`, and `/facilitator`;
  - `x402-hl/intents`, `/intents/client`, and `/intents/server`;
  - `x402-hl/paywall`.
- Confirm docs examples use upstream `@x402/*` packages plus `x402-hl`, not the
  archived fork.
- Confirm the version-2 intent docs match the implementation:
  - locally trusted application/gateway domain;
  - canonical finalized `PaymentRequirements` hash;
  - successful-settlement verification with expected quote and template;
  - atomic durable store registration and compare-and-swap transitions;
  - mandatory policy, simulation, confirmed execution, and refund adapters;
  - explicit refund and manual-intervention states.
- Check current upstream `@x402/*` versions and intentionally accept or reject
  dependency upgrades.

## 2. Reproducible Install And Validation

Run from `x402-hl/` with the supported Node and pnpm versions:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm example:express:typecheck
pnpm compat:all
pnpm docs:check
pnpm build
pnpm docs:build
pnpm pack:audit
```

Confirm:

- real tests cover positive and negative payment binding, signature,
  successful-settlement, domain/quote/template, replay/concurrency, state
  transition, policy, simulation, confirmed execution, refund, and uncertain
  outcome behavior;
- compatibility probes are reported as offline/mock probes unless explicitly
  run in funded mode;
- `docs:check` validates the docs configuration and `docs:build` renders every
  page and search artifact successfully;
- generated `dist/` files match the reviewed source;
- the production documentation never presents `InMemoryIntentExecutionStore`
  as a production store.

After building, no tracked generated artifact should be stale:

```sh
git diff --exit-code -- dist
git status --short
```

## 3. Tarball Audit

Create one candidate tarball and preserve its path:

```sh
pack_dir="$(mktemp -d)"
pnpm pack --pack-destination "$pack_dir"
tarball="$pack_dir/x402-hl-0.2.0.tgz"
tar -tzf "$tarball" | sort
```

Require the intent runtime and declarations:

```sh
for entry in \
  dist/intents/index.js \
  dist/intents/index.d.ts \
  dist/intents/client/index.js \
  dist/intents/client/index.d.ts \
  dist/intents/server/index.js \
  dist/intents/server/index.d.ts
do
  tar -tzf "$tarball" | grep -Fx "package/$entry"
done
```

Also confirm:

- `dist/`, package metadata, README, LICENSE, and the generated paywall asset
  are included;
- `CHANGELOG.md` is included;
- `docs/`, `examples/`, `.github/`, tests, local env files, and private keys are
  excluded;
- every path in `package.json#exports` exists in the tarball.

Install the exact artifact into a fresh consumer and import every entry point:

```sh
consumer_dir="$(mktemp -d)"
(
  cd "$consumer_dir"
  npm init -y
  npm install "$tarball"
  node --input-type=module -e '
    for (const name of [
      "x402-hl",
      "x402-hl/exact/client",
      "x402-hl/exact/server",
      "x402-hl/exact/facilitator",
      "x402-hl/intents",
      "x402-hl/intents/client",
      "x402-hl/intents/server",
      "x402-hl/paywall"
    ]) await import(name);
  '
)
```

Run a TypeScript consumer fixture against the installed tarball as well; source
path aliases do not prove that published declarations resolve.

## 4. Intent Example Validation

Typecheck and run the production intent example or its checked-in executable
fixture. It must prove, without funded keys:

- unique quote id plus upstream payment identifier;
- client approval of a locally configured domain;
- a signature over the exact finalized payment requirements;
- rejection of missing/failed settlement and every binding mismatch;
- atomic duplicate quote/payment/intent rejection in a durable-store adapter
  contract test;
- canonical ABI decode, target and selector allowlist, complete calldata
  comparison, and recipient validation;
- simulation evidence for the same call and signed gas/slippage limits;
- confirmed execution receipt before `executed`;
- definitive failure through confirmed refund to `refunded`;
- uncertain execution/refund through `manual_intervention`;
- explicit retry of a retryable `refund_failed` record.

Do not describe a mocked `SettleResponse` or fake transaction hash as a funded
smoke.

## 5. Funded Evidence

Keep network capability, funded HyperCore settlement, and funded HyperEVM
execution as separate evidence rows.

Current baseline:

| Evidence | Testnet | Mainnet |
| --- | --- | --- |
| Exact-scheme code support | Yes | Yes |
| Successful funded x402 settlement | 2026-06-09 `0xbf6176…`; 2026-06-12 `0xf53e86…` | None recorded |
| Failed funded attempt | Record new failures | 2026-06-13 `hl_exchange_error` |
| Funded version-2 HyperEVM intent execution | None recorded | None recorded |

For a funded testnet settlement, configure a controlled receiver and a funded
payer in untracked environment state, run the payer smoke, and record the full
`PAYMENT-RESPONSE` transaction, network, amount, package commit, and timestamp.

For a funded intent smoke, additionally record:

- quote id, payment identifier, intent hash, template hash, and payment
  requirements hash;
- HyperCore payment transaction;
- terminal durable-store status;
- confirmed HyperEVM execution transaction, or confirmed refund transaction;
- inventory balances before and after.

Only update the mainnet row after a successful funded mainnet settlement. Do not
infer success from a configured route, a browser paywall, `getSupported`, or a
service returning `200`.

## 6. Broker And Inventory Readiness

Before accepting production intent quotes:

- deploy a durable store with all required unique indexes and atomic CAS;
- pin application/gateway domain values in clients and servers;
- review target, selector, ABI, recipient, value, gas, and slippage policy;
- fund and monitor HyperEVM relayer gas and action inventory;
- reserve HyperCore refund liquidity;
- keep HyperCore-to-HyperEVM rebalancing outside the request path;
- alert on long-lived claims/submissions, `refund_failed`,
  `manual_intervention`, inventory pressure, and store conflicts;
- document reconciliation and operator escalation procedures.

## 7. Trusted Publishing Gate

Before creating the tag:

- verify the npm trusted-publisher association names the correct GitHub
  repository, `.github/workflows/publish.yml`, and `npm-publish` environment;
- verify the GitHub environment protection and authorized maintainers;
- confirm workflow permissions remain `contents: read` and `id-token: write`;
- confirm the workflow uses a trusted-publishing-capable npm version and does
  not depend on a long-lived npm token;
- confirm the workflow runs tests, docs checks, build, compatibility, tarball
  content assertions, and fresh consumer checks;
- prefer publishing the exact audited tarball rather than repacking it.

Create and push the tag only after every required gate passes.

## 8. Publish And Verify

After the trusted-publishing job succeeds:

```sh
npm view x402-hl@0.2.0 version dist-tags integrity shasum --json
```

Then:

- install `x402-hl@0.2.0` into a fresh directory and repeat runtime/type import
  checks;
- confirm npm provenance is present for the published artifact;
- validate public docs at `https://peezy.tech/x402-hl/`;
- compare the published tarball integrity with the release record;
- add a dated workspace note with exact commit, tag, workflow run, validation
  commands, full funded transaction hashes, npm metadata, evidence scope, and
  unresolved follow-ups.
