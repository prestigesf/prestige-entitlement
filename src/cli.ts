#!/usr/bin/env node
/**
 * Standalone stdio entry for the entitlement proxy.
 *
 *   npx tsx src/cli.ts --webhook-port 8787 --sample
 */
import { attachStdioProxy } from "prestige-mcp";
import { createEntitlementIntercept } from "./intercept.ts";
import { createRuntime } from "./runtime.ts";
import { createWebhookServer } from "./http.ts";
import { SANDBOX_WEBHOOK_SECRET } from "./fixtures.ts";
import { createStderrLogger } from "prestige-mcp";
import { createProxy } from "prestige-mcp";
import { createInterface } from "node:readline";
import { handlePremiumMcpLine } from "./mock-premium-server.ts";

function usage(): void {
  process.stderr.write(
    [
      "prestige-entitlement — RevenueCat MCP entitlement proxy",
      "",
      "usage:",
      "  npx tsx src/entitlement/cli.ts [options] -- <upstream command> [args...]",
      "  npx tsx src/entitlement/cli.ts --sample",
      "",
      "options:",
      "  --principal <id>         authenticated PrestigeMCP principal",
      "  --customer-id <id>       RevenueCat app_user_id (server mapping, not client-supplied at call time)",
      "  --webhook-port <n>       listen for signed RevenueCat webhooks",
      "  --upgrade-url <url>      ENTITLEMENT_REQUIRED upgrade URL",
      "  --sample                 in-process premium sample (no child process)",
      "",
      "env:",
      "  PRESTIGE_PRINCIPAL",
      "  PRESTIGE_RC_CUSTOMER_ID",
      "  REVENUECAT_WEBHOOK_SECRET   HMAC signing secret (never commit)",
      "  REVENUECAT_UPGRADE_URL",
      "",
    ].join("\n"),
  );
}

function parseArgs(argv: string[]) {
  const raw = argv.slice(2);
  let principal = process.env.PRESTIGE_PRINCIPAL ?? "anonymous";
  let customerId = process.env.PRESTIGE_RC_CUSTOMER_ID;
  let webhookPort: number | undefined;
  let upgradeUrl = process.env.REVENUECAT_UPGRADE_URL;
  let sample = false;
  const rest: string[] = [];

  for (let i = 0; i < raw.length; i++) {
    const tok = raw[i] ?? "";
    if (tok === "--help" || tok === "-h") {
      usage();
      process.exit(0);
    }
    if (tok === "--sample") {
      sample = true;
      continue;
    }
    if (tok === "--principal") {
      principal = raw[++i] ?? principal;
      continue;
    }
    if (tok === "--customer-id") {
      customerId = raw[++i];
      continue;
    }
    if (tok === "--webhook-port") {
      webhookPort = Number(raw[++i]);
      continue;
    }
    if (tok === "--upgrade-url") {
      upgradeUrl = raw[++i];
      continue;
    }
    rest.push(tok);
  }

  const dash = rest.indexOf("--");
  const cmdParts = dash >= 0 ? rest.slice(dash + 1) : rest;
  return { principal, customerId, webhookPort, upgradeUrl, sample, cmdParts };
}

async function main() {
  const parsed = parseArgs(process.argv);
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET ?? SANDBOX_WEBHOOK_SECRET;
  if (!process.env.REVENUECAT_WEBHOOK_SECRET) {
    process.stderr.write(
      JSON.stringify({
        event: "entitlement.warn",
        message: "REVENUECAT_WEBHOOK_SECRET unset; using sandbox secret (dev only)",
      }) + "\n",
    );
  }

  const clientWrites: string[] = [];
  void clientWrites;
  const runtime = createRuntime({
    principal: parsed.principal,
    customerId: parsed.customerId,
    webhookSecret: secret,
    upgradeUrl: parsed.upgradeUrl,
    emitToClient: (raw) => {
      process.stdout.write(raw.endsWith("\n") ? raw : raw + "\n");
    },
  });

  const intercept = createEntitlementIntercept(runtime);

  if (parsed.webhookPort && Number.isFinite(parsed.webhookPort)) {
    const { url } = await createWebhookServer(runtime, parsed.webhookPort);
    process.stderr.write(
      JSON.stringify({ event: "entitlement.webhook", url: `${url}/webhooks/revenuecat` }) +
        "\n",
    );
  }

  if (parsed.sample) {
    const log = createStderrLogger();
    const proxy = createProxy({
      writeToUpstream: (raw) => {
        const res = handlePremiumMcpLine(raw);
        if (res) void proxy.fromUpstream(res);
      },
      writeToClient: (raw) => {
        process.stdout.write(raw.endsWith("\n") ? raw : raw + "\n");
      },
      intercept,
      onLog: log,
    });
    const rl = createInterface({ input: process.stdin });
    rl.on("line", (line) => {
      if (!line.trim()) return;
      void proxy.fromClient(line);
    });
    return;
  }

  const command = parsed.cmdParts[0];
  if (!command) {
    usage();
    process.exit(1);
  }

  const handle = attachStdioProxy({
    command,
    args: parsed.cmdParts.slice(1),
    intercept,
  });
  handle.child.on("exit", (code) => process.exit(code ?? 0));
}

main().catch((err) => {
  process.stderr.write(JSON.stringify({ event: "fatal", error: String(err) }) + "\n");
  process.exit(1);
});
