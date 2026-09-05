import { createProxy, type PrestigeProxy } from "prestige-mcp";
import { createEntitlementIntercept } from "./intercept.ts";
import { createRuntime, type EntitlementRuntime } from "./runtime.ts";
import { handlePremiumMcpLine } from "./mock-premium-server.ts";
import {
  applyFixture,
  purchaseWebhook,
  SANDBOX_CUSTOMER_ID,
  SANDBOX_PRINCIPAL,
  SANDBOX_WEBHOOK_SECRET,
  type FixtureName,
} from "./fixtures.ts";
import { ingestSignedWebhook } from "./ingest.ts";
import { signRevenueCatWebhook } from "./hmac.ts";
import type { JsonRpcMessage } from "prestige-mcp";

export type SessionOptions = {
  fixture?: FixtureName;
  principal?: string;
  customerId?: string;
  webhookSecret?: string;
  nowMs?: () => number;
  compressSchemas?: boolean;
  tiered?: boolean;
};

export class EntitlementSession {
  readonly upstream: string[] = [];
  readonly client: string[] = [];
  readonly notifications: string[] = [];
  readonly runtime: EntitlementRuntime;
  readonly proxy: PrestigeProxy;
  private nextId = 1;
  private pendingUpstream: Promise<void> = Promise.resolve();

  constructor(options: SessionOptions = {}) {
    const secret = options.webhookSecret ?? SANDBOX_WEBHOOK_SECRET;
    this.runtime = createRuntime({
      principal: options.principal ?? SANDBOX_PRINCIPAL,
      customerId: options.customerId ?? SANDBOX_CUSTOMER_ID,
      webhookSecret: secret,
      nowMs: options.nowMs,
      emitToClient: (raw) => {
        this.notifications.push(raw);
        this.client.push(raw);
      },
    });
    applyFixture(this.runtime.cache, options.fixture ?? "free");

    this.proxy = createProxy({
      writeToUpstream: (raw) => {
        this.upstream.push(raw);
        const res = handlePremiumMcpLine(raw);
        if (res) this.pendingUpstream = this.proxy.fromUpstream(res);
      },
      writeToClient: (raw) => {
        this.client.push(raw);
      },
      intercept: createEntitlementIntercept(this.runtime, {
        compressSchemas: options.compressSchemas ?? true,
        tiered: options.tiered ?? false,
      }),
    });
  }

  lastClient(): JsonRpcMessage | undefined {
    const raw = this.client.at(-1);
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as JsonRpcMessage;
    } catch {
      return undefined;
    }
  }

  async list(): Promise<JsonRpcMessage> {
    const id = this.nextId++;
    await this.proxy.fromClient(
      JSON.stringify({ jsonrpc: "2.0", id, method: "tools/list" }),
    );
    await this.pendingUpstream;
    return this.lastClient() as JsonRpcMessage;
  }

  async call(name: string, args: Record<string, unknown> = {}): Promise<JsonRpcMessage> {
    const id = this.nextId++;
    await this.proxy.fromClient(
      JSON.stringify({
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    );
    await this.pendingUpstream;
    return this.lastClient() as JsonRpcMessage;
  }

  webhook(
    body: unknown,
    opts?: { tamper?: boolean; timestampSec?: number; header?: string },
  ) {
    const raw = Buffer.from(JSON.stringify(body), "utf8");
    const ts = opts?.timestampSec ?? Math.floor(Date.now() / 1000);
    const header =
      opts?.header ??
      signRevenueCatWebhook(this.runtime.webhookSecret, raw, ts);
    const payload = opts?.tamper ? Buffer.concat([raw, Buffer.from(" ")]) : raw;
    return ingestSignedWebhook(this.runtime, payload, header, ts);
  }

  grantViaSignedPurchase(eventId = "evt_live_purchase") {
    return this.webhook(purchaseWebhook({ eventId }));
  }
}

export function structured(message: JsonRpcMessage): Record<string, unknown> | undefined {
  const result = message.result;
  if (!result || typeof result !== "object" || Array.isArray(result)) return undefined;
  const rec = result as Record<string, unknown>;
  if (rec.structuredContent && typeof rec.structuredContent === "object") {
    return rec.structuredContent as Record<string, unknown>;
  }
  return rec;
}

export function toolNames(message: JsonRpcMessage): string[] {
  const result = message.result;
  if (!result || typeof result !== "object") return [];
  const tools = (result as { tools?: unknown }).tools;
  if (!Array.isArray(tools)) return [];
  return tools
    .map((tool) =>
      tool && typeof tool === "object" && "name" in tool
        ? String((tool as { name: unknown }).name)
        : "",
    )
    .filter(Boolean);
}

export function isLockedTool(message: JsonRpcMessage, name: string): boolean {
  const result = message.result;
  if (!result || typeof result !== "object") return false;
  const tools = (result as { tools?: unknown[] }).tools;
  if (!Array.isArray(tools)) return false;
  const tool = tools.find(
    (item) =>
      item && typeof item === "object" && (item as { name?: string }).name === name,
  ) as { _meta?: { prestige?: { locked?: boolean } } } | undefined;
  return tool?._meta?.prestige?.locked === true;
}

export function upstreamCalled(session: EntitlementSession, tool: string): boolean {
  return session.upstream.some((raw) => {
    try {
      const msg = JSON.parse(raw) as JsonRpcMessage;
      if (msg.method !== "tools/call") return false;
      const params = msg.params as { name?: string } | undefined;
      return params?.name === tool;
    } catch {
      return false;
    }
  });
}
