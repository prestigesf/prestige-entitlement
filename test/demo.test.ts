import assert from "node:assert/strict";
import { test } from "node:test";
import { runSevenBeatDemo } from "../src/demo.ts";

test("seven-beat RevenueCat entitlement demonstration", async () => {
  const result = await runSevenBeatDemo();
  const failed = result.beats.filter((b) => !b.ok).map((b) => b.title);
  assert.deepEqual(failed, [], `failed beats: ${failed.join(", ")}`);
  assert.equal(result.ok, true);
});
