import { EntitlementSession, isLockedTool, structured, toolNames, upstreamCalled } from "./session.ts";
import { ENTITLEMENT_REQUIRED } from "./types.ts";

export type DemoBeat = {
  beat: number;
  title: string;
  ok: boolean;
  detail: Record<string, unknown>;
};

/**
 * Required demonstration:
 * 1. Free tool succeeds.
 * 2. Premium tool is blocked.
 * 3. RevenueCat entitlement is activated.
 * 4. Signed webhook updates the proxy.
 * 5. Tool catalog refreshes.
 * 6. Premium tool succeeds.
 * 7. Evidence receipt records authorization and execution.
 */
export async function runSevenBeatDemo(): Promise<{ ok: boolean; beats: DemoBeat[] }> {
  const session = new EntitlementSession({ fixture: "free", tiered: false });
  const beats: DemoBeat[] = [];

  const free = await session.call("echo", { text: "hello" });
  const freeText =
    (free.result as { content?: { text?: string }[] } | undefined)?.content?.[0]?.text ?? "";
  beats.push({
    beat: 1,
    title: "Free tool succeeds",
    ok: freeText === "hello" && upstreamCalled(session, "echo"),
    detail: { result: freeText, reachedUpstream: upstreamCalled(session, "echo") },
  });

  session.upstream.length = 0;
  const blocked = await session.call("goldtrac_trace", { note: "should-deny" });
  const blockedBody = structured(blocked);
  beats.push({
    beat: 2,
    title: "Premium tool is blocked",
    ok:
      blockedBody?.code === ENTITLEMENT_REQUIRED &&
      !upstreamCalled(session, "goldtrac_trace"),
    detail: {
      code: blockedBody?.code,
      reachedUpstream: upstreamCalled(session, "goldtrac_trace"),
      upgradeUrl: blockedBody?.upgradeUrl,
    },
  });

  const purchase = session.grantViaSignedPurchase("evt_demo_purchase");
  beats.push({
    beat: 3,
    title: "RevenueCat entitlement is activated",
    ok:
      purchase.status === 200 &&
      purchase.result?.changed === true &&
      session.runtime.cache.hasActive(
        session.runtime.binding.customerId,
        "prestige_pro",
      ),
    detail: {
      status: purchase.status,
      eventId: purchase.result?.eventId,
      active: session.runtime.cache.hasActive(
        session.runtime.binding.customerId,
        "prestige_pro",
      ),
    },
  });

  beats.push({
    beat: 4,
    title: "Signed webhook updates the proxy",
    ok: purchase.verified.ok === true && purchase.result?.applied === true,
    detail: { hmac: purchase.verified, applied: purchase.result?.applied },
  });

  const list = await session.list();
  const names = toolNames(list);
  const refreshed = session.notifications.some((n) => n.includes("tools/list_changed"));
  beats.push({
    beat: 5,
    title: "Tool catalog refreshes",
    ok:
      refreshed &&
      names.includes("goldtrac_trace") &&
      !isLockedTool(list, "goldtrac_trace"),
    detail: { listChanged: refreshed, tools: names },
  });

  session.upstream.length = 0;
  const premium = await session.call("goldtrac_trace", { note: "ship" });
  const premiumText =
    (premium.result as { content?: { text?: string }[] } | undefined)?.content?.[0]?.text ??
    "";
  beats.push({
    beat: 6,
    title: "Premium tool succeeds",
    ok: premiumText === "goldtrac:ship" && upstreamCalled(session, "goldtrac_trace"),
    detail: { result: premiumText, reachedUpstream: upstreamCalled(session, "goldtrac_trace") },
  });

  const evidence = session.runtime.evidence.events;
  const deny = evidence.some(
    (e) => e.kind === "mcp.authorization" && e.decision === "deny" && e.tool === "goldtrac_trace",
  );
  const allowAuth = evidence.some(
    (e) => e.kind === "mcp.authorization" && e.decision === "allow" && e.tool === "goldtrac_trace",
  );
  const exec = evidence.some(
    (e) => e.kind === "mcp.execution" && e.decision === "allow" && e.tool === "goldtrac_trace",
  );
  const noSecrets = evidence.every(
    (e) =>
      !JSON.stringify(e).includes(session.runtime.webhookSecret) &&
      !JSON.stringify(e).includes(session.runtime.binding.principal),
  );
  beats.push({
    beat: 7,
    title: "Evidence receipt records authorization and execution",
    ok: deny && allowAuth && exec && noSecrets,
    detail: {
      events: evidence.length,
      deny,
      allowAuth,
      exec,
      noSecrets,
      last: evidence.at(-1),
    },
  });

  return { ok: beats.every((b) => b.ok), beats };
}

const isMain = process.argv[1]?.endsWith("demo.ts") || process.argv[1]?.endsWith("demo.js");
if (isMain) {
  runSevenBeatDemo()
    .then((result) => {
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      process.exit(result.ok ? 0 : 1);
    })
    .catch((err) => {
      process.stderr.write(String(err) + "\n");
      process.exit(1);
    });
}
