import { createServer, type IncomingMessage, type Server } from "node:http";
import { ingestSignedWebhook } from "./ingest.ts";
import { SIGNATURE_HEADER } from "./hmac.ts";
import type { EntitlementRuntime } from "./runtime.ts";

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function readRaw(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer | string) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/**
 * Least-privilege webhook listener. HMAC on raw body, then cache apply.
 * No RevenueCat REST secret is required on this path.
 */
export function createWebhookServer(
  runtime: EntitlementRuntime,
  port: number,
): Promise<{ server: Server; url: string }> {
  const server = createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, health: runtime.cache.health }));
      return;
    }
    if (req.method === "POST" && req.url === "/webhooks/revenuecat") {
      const raw = await readRaw(req);
      const sig =
        header(req, SIGNATURE_HEADER) ?? header(req, "X-RevenueCat-Webhook-Signature");
      const result = ingestSignedWebhook(runtime, raw, sig);
      res.writeHead(result.status, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          ok: result.status === 200,
          duplicate: result.result?.duplicate ?? false,
          changed: result.result?.changed ?? false,
          reason: result.verified.ok ? undefined : result.verified.reason,
        }),
      );
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}
