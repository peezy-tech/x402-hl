# x402-hl Release Checklist

Use this checklist before publishing a new `x402-hl` package version.

## Before Bumping

- Check current upstream `@x402/*` package versions and decide whether this
  release should upgrade them.
- Confirm `package.json` exports still match the built `dist/` surface.
- Confirm docs examples still target upstream x402 packages plus `x402-hl`, not
  the archived fork.
- Review `files` in `package.json`; keep docs, examples, and workflow files out
  of the npm tarball unless intentionally changing package contents.

## Local Validation

Run from `x402-hl/`:

```sh
pnpm build
pnpm typecheck
pnpm example:express:typecheck
pnpm compat:all
pnpm docs:build
pnpm pack --pack-destination /tmp
```

Audit the tarball:

- includes `dist/`, `src/paywall/gen/`, package metadata, README, and LICENSE;
- excludes `docs/`, `examples/`, `.github/`, and local env files.

## Demo Validation

After publishing or packing the candidate, update `x402-demo/` to consume the
candidate version and run:

```sh
PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 pnpm typecheck
PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 pnpm smoke
```

For a funded testnet settlement, configure a controlled recipient and funded
payer in untracked `.env`, then run:

```sh
PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 pnpm pay
```

Record the `PAYMENT-RESPONSE` transaction hash in the workspace notes.

## Publish And Verify

- Publish with the intended npm tag.
- Verify npm metadata:

```sh
npm view x402-hl version dist-tags integrity shasum --json
```

- Validate public docs at `https://peezy.tech/x402-hl/`.
- Validate live demo config at `https://hq.peezy.tech/x402/api/config`.
- Add a dated note under the workspace `notes/` directory with release commit,
  tag, validation commands, npm metadata, and any follow-ups.
