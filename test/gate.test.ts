import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EntitlementSession,
  structured,
  upstreamCalled,
} from "../src/session.ts";
import { ENTITLEMENT_REQUIRED } from "../src/types.ts";

test("blocked premium tools never reach the downstream MCP server", async () => {
  const session = new EntitlementSession({ fixture: "free" });
  const result = await session.call("goldtrac_trace", { note: "nope" });
  const body = structured(result);
  assert.equal(body?.code, ENTITLEMENT_REQUIRED);
  assert.equal(body?.entitlement, "prestige_pro");
  assert.equal(typeof body?.upgradeUrl, "string");
  assert.equal(upstreamCalled(session, "goldtrac_trace"), false);
  assert.equal(
    session.upstream.some((line) => line.includes("goldtrac_trace")),
    false,
  );
});

test("free tools still reach upstream while premium is blocked", async () => {
  const session = new EntitlementSession({ fixture: "free" });
  const echo = await session.call("echo", { text: "ok" });
  const text = (echo.result as { content: { text: string }[] }).content[0]?.text;
  assert.equal(text, "ok");
  assert.equal(upstreamCalled(session, "echo"), true);

  session.upstream.length = 0;
  await session.call("premium_forecast", { horizon: 3 });
  assert.equal(upstreamCalled(session, "premium_forecast"), false);
});

test("expired and missing fixtures fail closed for premium", async () => {
  for (const fixture of ["expired", "missing"] as const) {
    const session = new EntitlementSession({ fixture });
    await session.call("goldtrac_trace", { note: fixture });
    assert.equal(upstreamCalled(session, "goldtrac_trace"), false);
  }
});
