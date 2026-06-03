# x402-hl Express Example

Standalone Express app for accepting `exact` x402 payments on
`hyperliquid:testnet`.

This example is for GitHub readers. It is not shipped in the npm package.

## Install

From this directory:

```sh
pnpm install
cp .env.example .env
```

When running inside a clone of `x402-hl`, the example depends on the local
package with `x402-hl: file:../..`. If you copy this example into another repo,
change that dependency to the published version:

```json
"x402-hl": "^0.1.1"
```

## Configure

Set a recipient address in `.env`:

```sh
HYPERLIQUID_PAY_TO_ADDRESS=0x...
```

Browser-wallet payments do not require a server-side payer key. The optional
`HYPERLIQUID_PAYER_PRIVATE_KEY` is only for the `pnpm pay` server-side smoke
test.

## Run

```sh
pnpm start
```

Open `http://127.0.0.1:4020/x402` and select the wallet paywall, or inspect the
raw x402 challenge:

```sh
curl -i -H 'Accept: application/json' http://127.0.0.1:4020/x402/api/paid
```

## Validate

```sh
pnpm typecheck
pnpm smoke
```

With a funded Hyperliquid testnet payer key:

```sh
pnpm pay
```
