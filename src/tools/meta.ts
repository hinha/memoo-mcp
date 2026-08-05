import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SERVER_INSTRUCTIONS, WORKFLOW_DOC } from "../instructions.js";

/** Optional docs resources + prompts for hosts that surface them. */
export function registerMeta(server: McpServer): void {
  server.registerResource(
    "workflow",
    "memoo://docs/workflow",
    {
      title: "Memoo MCP workflow",
      description: "How agents should use Memoo tools",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: WORKFLOW_DOC,
        },
      ],
    }),
  );

  server.registerResource(
    "instructions",
    "memoo://docs/instructions",
    {
      title: "Server instructions",
      description: "Same text sent on MCP initialize",
      mimeType: "text/plain",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/plain",
          text: SERVER_INSTRUCTIONS,
        },
      ],
    }),
  );

  server.registerPrompt(
    "memoo_explore",
    {
      title: "Explore knowledge graph",
      description:
        "Guide for exploring a Memoo namespace with search, ask, and graph tools",
      argsSchema: {
        topic: z.string().describe("Topic or entity to explore"),
      },
    },
    async ({ topic }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Explore the Memoo knowledge graph about: ${topic}

1. If a default namespace is already configured, skip memoo_list_namespaces
2. memoo_search / search for starting entities
3. memoo_graph_traverse from promising entity_uuid values
4. memoo_list_episodes / fetch for chronological context
5. memoo_ask for a synthesized answer
6. memoo_temporal_query if you need a point-in-time view`,
          },
        },
      ],
    }),
  );
}
