import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildServerInstructions } from "./instructions.js";
import type { Runtime } from "./runtime.js";
import { registerTools, registerResources } from "./tools/register.js";
import { registerMeta } from "./tools/meta.js";

export const SERVER_NAME = "memoo-mcp";
export const SERVER_VERSION = "1.0.0";

export function buildMcpServer(runtime: Runtime): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions: buildServerInstructions(runtime.config.defaultNamespace),
    },
  );
  registerTools(server, runtime);
  registerResources(server, runtime);
  registerMeta(server);
  return server;
}
