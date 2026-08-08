import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildServerInstructions } from "./instructions.js";
import { getPackageName, getPackageVersion } from "./package-meta.js";
import type { Runtime } from "./runtime.js";
import { registerMeta } from "./tools/meta.js";
import { registerResources, registerTools } from "./tools/register.js";

export const SERVER_NAME = getPackageName();
export const SERVER_VERSION = getPackageVersion();

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
