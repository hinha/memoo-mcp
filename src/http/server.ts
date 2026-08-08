import { randomUUID } from "node:crypto";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { loadConfig, type MemooConfig, validateApiKey } from "../config.js";
import { buildMcpServer } from "../create-mcp.js";
import { log } from "../logging.js";
import { createRuntime } from "../runtime.js";

/** Fixed Streamable HTTP mount — not configurable (stdio ignores this). */
export const HTTP_MCP_PATH = "/mcp";

/** Drop abandoned HTTP MCP sessions (clients that never send DELETE/close). */
const SESSION_IDLE_MS = 30 * 60 * 1000;
const SESSION_SWEEP_MS = 60 * 1000;

type TransportEntry = {
  transport: StreamableHTTPServerTransport;
  apiKey: string;
  server: McpServer;
  lastUsed: number;
};

export function extractBearerToken(authHeader: string | undefined): string {
  const parts = (authHeader ?? "").trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    throw new Error("authorization header must be 'Bearer <moo_sk...>'");
  }
  return parts[1];
}

export function isOriginAllowed(origin: string, allowlist: string[]): boolean {
  const o = origin.trim();
  if (!o) return true;
  if (allowlist.length === 0) {
    return (
      o.startsWith("http://localhost") ||
      o.startsWith("https://localhost") ||
      o.startsWith("http://127.0.0.1") ||
      o.startsWith("https://127.0.0.1") ||
      o.startsWith("http://[::1]") ||
      o.startsWith("https://[::1]")
    );
  }
  for (const rule of allowlist) {
    const r = rule.trim();
    if (!r) continue;
    if (r === "*") return true;
    if (r.endsWith("*") && o.startsWith(r.slice(0, -1))) return true;
    if (o.toLowerCase() === r.toLowerCase()) return true;
  }
  return false;
}

export function parseAllowedOrigins(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--allowed-origin" && argv[i + 1]) {
      out.push(argv[++i]);
    } else if (argv[i].startsWith("--allowed-origin=")) {
      out.push(argv[i].slice("--allowed-origin=".length));
    }
  }
  const env = process.env.MEMOO_ALLOWED_ORIGINS?.trim();
  if (env) {
    for (const part of env.split(",")) {
      const t = part.trim();
      if (t) out.push(t);
    }
  }
  return out;
}

export function resolveHttpApiKey(req: import("express").Request, config: MemooConfig): string {
  const header = req.headers.authorization;
  if (header) {
    const token = extractBearerToken(header);
    validateApiKey(token, config.apiKeyPrefix);
    return token;
  }
  if (config.apiKey) {
    validateApiKey(config.apiKey, config.apiKeyPrefix);
    return config.apiKey;
  }
  throw new Error("authorization header must be 'Bearer <moo_sk...>'");
}

/* c8 ignore start — HTTP listen loop / session lifecycle covered by manual/operator checks */
async function disposeSession(
  transports: Record<string, TransportEntry>,
  sid: string,
  opts: { skipTransportClose?: boolean } = {},
): Promise<void> {
  const entry = transports[sid];
  if (!entry) return;
  delete transports[sid];
  if (!opts.skipTransportClose) {
    try {
      await entry.transport.close();
    } catch {
      /* already closed */
    }
  }
  try {
    await entry.server.close();
  } catch {
    /* already closed */
  }
}

export async function startHttpServer(argv: string[] = process.argv.slice(2)): Promise<void> {
  const config = loadConfig(argv);
  const allowedOrigins = parseAllowedOrigins(argv);
  const host = config.host;
  const port = config.port;
  const mcpPath = HTTP_MCP_PATH;

  try {
    const probe = createRuntime(config, config.apiKey || "moo_sk_probe");
    await probe.client.checkHealth();
  } catch (err) {
    log.warn("upstream health check failed at HTTP boot", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const appHost =
    host === "0.0.0.0" || host === "::"
      ? {
          host,
          allowedHosts: ["127.0.0.1", "localhost", "[::1]"],
        }
      : { host };

  const app = createMcpExpressApp(appHost);
  const transports: Record<string, TransportEntry> = {};

  const sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [sid, entry] of Object.entries(transports)) {
      if (now - entry.lastUsed > SESSION_IDLE_MS) {
        log.info("evicting idle MCP HTTP session", { sessionId: sid });
        void disposeSession(transports, sid);
      }
    }
  }, SESSION_SWEEP_MS);
  sweepTimer.unref();

  const shutdown = () => {
    clearInterval(sweepTimer);
    for (const sid of Object.keys(transports)) {
      void disposeSession(transports, sid);
    }
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  app.use((req, res, next) => {
    if (req.path !== mcpPath && req.path !== "/health") {
      next();
      return;
    }
    const origin = req.headers.origin ?? "";
    if (req.path === mcpPath && !isOriginAllowed(origin, allowedOrigins)) {
      res.status(403).send("forbidden: origin is not allowed");
      return;
    }
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version",
      );
    }
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      mcp_url: `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}${mcpPath}`,
      auth: "Bearer moo_sk… (or MEMOO_API_KEY)",
      sessions: Object.keys(transports).length,
    });
  });

  const mcpHandler = async (req: import("express").Request, res: import("express").Response) => {
    let apiKey: string;
    try {
      apiKey = resolveHttpApiKey(req, config);
    } catch (err) {
      res.status(401).send(err instanceof Error ? err.message : "unauthorized");
      return;
    }

    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    try {
      const existing = sessionId ? transports[sessionId] : undefined;

      if (existing) {
        existing.lastUsed = Date.now();
        await existing.transport.handleRequest(req, res, req.body);
        return;
      }

      if (!sessionId && isInitializeRequest(req.body)) {
        const runtime = createRuntime(config, apiKey);
        const server = buildMcpServer(runtime);

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            transports[sid] = {
              transport,
              apiKey,
              server,
              lastUsed: Date.now(),
            };
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) {
            void disposeSession(transports, sid, { skipTransportClose: true });
          }
        };

        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      }

      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: No valid session ID provided",
        },
        id: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error("MCP HTTP error", { message });
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message },
          id: null,
        });
      }
    }
  };

  app.post(mcpPath, mcpHandler);
  app.get(mcpPath, mcpHandler);
  app.delete(mcpPath, mcpHandler);

  await new Promise<void>((resolve, reject) => {
    app.listen(port, host, (err?: Error) => {
      if (err) reject(err);
      else resolve();
    });
  });

  const mcpUrl = `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}${mcpPath}`;
  log.info("memoo-mcp HTTP listening", { host, port, mcp_url: mcpUrl });
  console.error(`[memoo-mcp] MCP URL: ${mcpUrl}`);
  console.error("[memoo-mcp] Auth: Authorization: Bearer moo_sk… (or MEMOO_API_KEY)");
}
/* c8 ignore stop */
