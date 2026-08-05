#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig, validateApiKey } from "./config.js";
import { createRuntime } from "./runtime.js";
import { buildMcpServer } from "./create-mcp.js";
import { log } from "./logging.js";

function wantsHttp(argv: string[]): boolean {
  if (argv.includes("--stdio")) return false;
  if (argv.includes("serve") || argv.includes("--http")) return true;
  return process.env.MEMOO_MCP_MODE?.trim() === "http";
}

async function startStdio(argv: string[]): Promise<void> {
  const config = loadConfig(argv);
  validateApiKey(config.apiKey, config.apiKeyPrefix);

  const runtime = createRuntime(config);

  log.info("checking upstream Memoo API health", {
    memoo_base_url: config.baseUrl,
  });
  try {
    const health = await runtime.client.checkHealth();
    const status =
      typeof health.status === "string" ? health.status : "unknown";
    if (status !== "healthy") {
      throw new Error(`upstream not healthy: ${JSON.stringify(health)}`);
    }
  } catch (err) {
    log.error("upstream health check failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  }

  const namespaceIdentifier = config.defaultNamespace?.trim() ?? "";
  if (!namespaceIdentifier) {
    log.error(
      "namespace is required - use --memo-namespace <UUID|name> or MEMOO_NAMESPACE (create via POST /api/v1/namespaces)",
    );
    process.exit(1);
  }

  // Resolve UUID|name via GET /api/v1/namespaces/{id} (detail) — not list.
  // Also validates the API key in the same authenticated call.
  log.info("validating namespace with upstream API (detail)", {
    namespace: namespaceIdentifier,
  });
  let namespaceName: string;
  try {
    namespaceName = await runtime.client.resolveNamespaceName(
      runtime.apiKey,
      namespaceIdentifier,
    );
  } catch (err) {
    log.error("namespace validation failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  }
  runtime.config.defaultNamespace = namespaceName;
  log.info("namespace validated", {
    namespace_identifier: namespaceIdentifier,
    namespace_name: namespaceName,
  });

  const server = buildMcpServer(runtime);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info("memoo-mcp listening on stdio", {
    baseUrl: config.baseUrl,
    defaultNamespace: namespaceName,
    timeoutMs: config.timeoutMs,
  });
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (wantsHttp(argv)) {
    const { startHttpServer } = await import("./http/server.js");
    await startHttpServer(argv);
    return;
  }
  await startStdio(argv);
}

main().catch((err) => {
  console.error("[memoo-mcp] fatal:", err);
  process.exit(1);
});
