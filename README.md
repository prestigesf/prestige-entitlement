# prestige-entitlement

Standalone **RevenueCat MCP entitlement proxy** for Burning Token 2026.

This is **not** part of [`prestige-mcp`](https://github.com/prestigesf/prestige-mcp). It sits in front of PrestigeMCP as a separate package: schema compression and tiered loading stay in `prestige-mcp`; this repo only does boolean entitlement gating.

## What it does

1. Maps an authenticated PrestigeMCP principal to a trusted RevenueCat customer id (server-side, never client-supplied at call time).
2. `tools/list` previews locked premium tools **after** PrestigeMCP compression/tiering.
3. `tools/call` answers `ENTITLEMENT_REQUIRED` locally. Blocked premium calls never reach the upstream MCP server.
4. Signed RevenueCat webhooks update a local cache. Execution does not call RevenueCat.
5. Fail closed for premium if the cache is unverifiable. Free tools stay up during an outage.
6. Emits `notifications/tools/list_changed` when entitlements change the catalog.
7. GoldTrac-compatible evidence receipts. No payment details, secrets, or raw principals.

## Demo (seven beats)

```sh
npm install
npm test
npm run demo
```

1. Free tool succeeds.
2. Premium tool is blocked.
3. RevenueCat entitlement is activated.
4. Signed webhook updates the proxy.
5. Tool catalog refreshes.
6. Premium tool succeeds.
7. Evidence records authorization and execution.

## HMAC

`X-RevenueCat-Webhook-Signature: t=<unix>,v1=<hmac_sha256_hex>` over `"<t>." + rawBody`. Verify the untouched raw bytes, constant-time compare, 300s timestamp window, `event.id` idempotency.

Set `REVENUECAT_WEBHOOK_SECRET` in the environment. Sandbox fixtures use `whsec_sandbox_not_a_real_secret`. Never commit live keys.

## Error shape

JSON-RPC **success** with MCP tool result `isError: true` and `structuredContent.code = "ENTITLEMENT_REQUIRED"` plus `upgradeUrl`. This is not JSON-RPC `-32002`.

## Run as a proxy

```sh
REVENUECAT_WEBHOOK_SECRET=... npx tsx src/cli.ts --webhook-port 8787 -- npx tsx src/cli.ts --sample
```

Or `--sample` for an in-process premium catalog (`echo`, `add`, `goldtrac_trace`, `premium_forecast`).
