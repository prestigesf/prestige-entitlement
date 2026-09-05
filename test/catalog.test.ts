import assert from "node:assert/strict";
import { test } from "node:test";
import { EntitlementSession, isLockedTool, toolNames } from "../src/session.ts";

test("tools/list previews premium tools without dropping compression/tier wrappers", async () => {
  const session = new EntitlementSession({ fixture: "free", compressSchemas: true, tiered: false });
  const listed = await session.list();
  const names = toolNames(listed);
  assert.equal(names.includes("echo"), true);
  assert.equal(names.includes("goldtrac_trace"), true);
  assert.equal(isLockedTool(listed, "goldtrac_trace"), true);
  assert.equal(isLockedTool(listed, "echo"), false);
});

test("pro fixture lists goldtrac_trace unlocked", async () => {
  const session = new EntitlementSession({ fixture: "pro" });
  const listed = await session.list();
  assert.equal(isLockedTool(listed, "goldtrac_trace"), false);
});
