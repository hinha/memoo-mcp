import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { resolveNamespace } from "../config.js";
import { log } from "../logging.js";
import { MemooApiError } from "../memoo/errors.js";
import type { JsonObject } from "../memoo/types.js";
import type { Runtime } from "../runtime.js";

function textResult(payload: unknown) {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  return { content: [{ type: "text" as const, text }] };
}

function errorResult(err: unknown) {
  const mapped = mapApiError(err);
  const message = mapped instanceof Error ? mapped.message : String(mapped);
  log.error(message);
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

export function mapApiError(err: unknown): Error {
  if (err instanceof MemooApiError) {
    switch (err.statusCode) {
      case 401:
      case 403:
        return new Error(`authorization failed: ${err.message}`);
      case 404:
        return new Error(`not found: ${err.message}`);
      case 400:
        return new Error(`invalid input: ${err.message}`);
      case 413:
        return new Error(
          `${err.message} Summarize to key facts/decisions and retry (limit is plan entitlement episode_content_words, not a fixed MCP 900).`,
        );
      default:
        return new Error(`memoo api request failed: ${err.message}`);
    }
  }
  return err instanceof Error ? err : new Error(String(err));
}

function nsDesc(defaultNamespace: string | null): string {
  return defaultNamespace
    ? "Namespace name (uses default from MEMOO_NAMESPACE if not provided)"
    : "Namespace name";
}

function resultCount(results: unknown): number {
  return Array.isArray(results) ? results.length : 0;
}

function normalizeNamespaces(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const obj = raw as JsonObject;
    if (Array.isArray(obj.results)) return obj.results;
    if (Array.isArray(obj.namespaces)) return obj.namespaces;
  }
  return [];
}

export function registerTools(server: McpServer, runtime: Runtime): void {
  const { client, config } = runtime;
  const apiKey = () => {
    const key = runtime.apiKey.trim();
    if (!key) throw new Error("missing API key (set MEMOO_API_KEY or Bearer)");
    return key;
  };
  const ns = (provided?: string) => resolveNamespace(provided, config.defaultNamespace);

  server.registerTool(
    "search",
    {
      title: "Search",
      description: "Compatibility search tool for MCP hosts (read-only Memoo knowledge search).",
      inputSchema: {
        namespace: z.string().optional().describe(nsDesc(config.defaultNamespace)),
        query: z.string().describe("Natural language search query"),
        entity_types: z.array(z.string()).optional(),
        limit: z.number().int().min(1).max(100).optional().default(10),
        min_relevance: z.number().min(0).max(1).optional().default(0),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        const namespace = ns(args.namespace);
        const query = args.query.trim();
        if (!query) throw new Error("query is required");
        const out = await client.search(apiKey(), namespace, {
          query,
          entity_types: args.entity_types,
          limit: args.limit ?? 10,
          min_relevance: args.min_relevance ?? 0,
        });
        return textResult({
          namespace,
          query,
          result_count: resultCount(out.results),
          results: out.results ?? [],
          next_cursor: out.next_cursor,
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "fetch",
    {
      title: "Fetch",
      description: "Compatibility fetch tool for MCP hosts (fetch full episode by ID).",
      inputSchema: {
        namespace: z.string().optional().describe(nsDesc(config.defaultNamespace)),
        id: z.string().describe("Episode ID"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        const namespace = ns(args.namespace);
        const id = args.id.trim();
        if (!id) throw new Error("id is required");
        const episode = await client.getEpisode(apiKey(), namespace, id);
        return textResult({ namespace, id, episode });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "memoo_list_namespaces",
    {
      title: "List Namespaces",
      description: "List namespaces visible to the API key owner.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional().default(20),
        offset: z.number().int().min(0).optional().default(0),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        const raw = await client.listNamespaces(apiKey(), args.limit ?? 20, args.offset ?? 0);
        const namespaces = normalizeNamespaces(raw);
        return textResult({ namespaces, count: namespaces.length });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "memoo_list_episodes",
    {
      title: "List Episodes",
      description: "List episodes in a namespace.",
      inputSchema: {
        namespace: z.string().optional().describe(nsDesc(config.defaultNamespace)),
        page: z.number().int().min(1).optional().default(1),
        page_size: z.number().int().min(1).max(100).optional().default(20),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        const namespace = ns(args.namespace);
        const out = await client.listEpisodes(
          apiKey(),
          namespace,
          args.page ?? 1,
          args.page_size ?? 20,
        );
        return textResult(out);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "memoo_search",
    {
      title: "Memoo Search",
      description: "Search knowledge in a namespace.",
      inputSchema: {
        namespace: z.string().optional().describe(nsDesc(config.defaultNamespace)),
        query: z.string(),
        entity_types: z.array(z.string()).optional(),
        limit: z.number().int().min(1).max(100).optional().default(10),
        min_relevance: z.number().min(0).max(1).optional().default(0),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        const namespace = ns(args.namespace);
        const query = args.query.trim();
        if (!query) throw new Error("query is required");
        const out = await client.search(apiKey(), namespace, {
          query,
          entity_types: args.entity_types,
          limit: args.limit ?? 10,
          min_relevance: args.min_relevance ?? 0,
        });
        return textResult({
          namespace,
          query,
          result_count: resultCount(out.results),
          results: out.results ?? [],
          next_cursor: out.next_cursor,
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "memoo_ask",
    {
      title: "Memoo Ask",
      description: "Ask a natural language question using Memoo RAG.",
      inputSchema: {
        namespace: z.string().optional().describe(nsDesc(config.defaultNamespace)),
        query: z.string(),
        limit: z.number().int().min(1).max(50).optional().default(10),
        use_reranker: z.boolean().optional().default(false),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        const namespace = ns(args.namespace);
        const query = args.query.trim();
        if (!query) throw new Error("query is required");
        const out = await client.ask(apiKey(), namespace, {
          query,
          limit: args.limit ?? 10,
          use_reranker: args.use_reranker ?? false,
        });
        return textResult(out);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "memoo_graph_traverse",
    {
      title: "Graph Traverse",
      description: "Traverse graph relationships from an entity.",
      inputSchema: {
        namespace: z.string().optional().describe(nsDesc(config.defaultNamespace)),
        entity_uuid: z.string(),
        max_hops: z.number().int().min(1).max(5).optional().default(2),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        const namespace = ns(args.namespace);
        const entityUuid = args.entity_uuid.trim();
        if (!entityUuid) throw new Error("entity_uuid is required");
        const out = await client.graphTraverse(apiKey(), namespace, {
          entity_uuid: entityUuid,
          max_hops: args.max_hops ?? 2,
        });
        return textResult(out);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "memoo_temporal_query",
    {
      title: "Temporal Query",
      description: "Run a temporal query at a specific time.",
      inputSchema: {
        namespace: z.string().optional().describe(nsDesc(config.defaultNamespace)),
        query: z.string(),
        at_time: z.number().int().describe("Unix timestamp"),
        limit: z.number().int().min(1).max(50).optional().default(10),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        const namespace = ns(args.namespace);
        const query = args.query.trim();
        if (!query || args.at_time <= 0) {
          throw new Error("query and at_time are required");
        }
        const out = await client.temporalQuery(apiKey(), namespace, {
          query,
          at_time: args.at_time,
          limit: args.limit ?? 10,
        });
        return textResult(out);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "memoo_create_episode",
    {
      title: "Create Episode",
      description: `Create/ingest an episode in a namespace (always async).

IMPORTANT: Before calling this tool, you MUST summarize the content to key facts, decisions, entities, and relationships. Do NOT send raw/transcribed content verbatim.

Word limit is enforced by the Memoo API (entitlement dimension episode_content_words from the caller's plan; config fallback typically 1200). Plan catalog examples: free≈300, lite/pro≈500, max≈5000. Prefer ≤300 words. If the API returns 413 / "Content too long", summarize further and retry.

ALWAYS ASYNC: Memoo returns HTTP 202 with job_id immediately. You MUST then call memoo_get_job_status until 'completed' or 'failed' (entity extraction may take 1–3+ minutes). Do not expect episode_id from this tool. Do not bypass MCP with raw HTTP.

1. memoo_create_episode → job_id (queued)
2. memoo_get_job_status(job_id) until completed/failed
3. If completed, job detail may include result_episode_id`,
      inputSchema: {
        namespace: z.string().optional().describe(nsDesc(config.defaultNamespace)),
        name: z.string().optional().describe("Short descriptive title for this episode"),
        content: z
          .string()
          .describe(
            "A concise summary to store (NOT raw source). Prefer under ~300 words; hard max is the caller's plan episode_content_words.",
          ),
        source: z
          .string()
          .optional()
          .describe("Origin of the content (e.g. 'conversation', 'document', 'github')"),
        source_id: z.string().optional().describe("Unique identifier from the source system"),
        metadata: z.record(z.string(), z.string()).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const namespace = ns(args.namespace);
        const content = args.content.trim();
        if (!content) throw new Error("content is required");
        const out = await client.createEpisode(apiKey(), namespace, {
          name: args.name,
          content,
          source: args.source,
          source_id: args.source_id,
          metadata: args.metadata ?? {},
        });
        const jobId = typeof out.job_id === "string" ? out.job_id.trim() : "";
        if (!jobId) {
          throw new Error(
            "Memoo create episode did not return job_id (async ingest required). Check async_ingestion / job queue on memoo-api.",
          );
        }
        return textResult({
          job_id: jobId,
          status: "queued",
          message:
            "Episode ingestion queued. Poll memoo_get_job_status until completed or failed (may take minutes).",
          check_url: `/api/v1/jobs/${jobId}/detail`,
          next_action: "poll_with_memoo_get_job_status",
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "memoo_get_job_status",
    {
      title: "Get Job Status",
      description:
        "Poll an episode ingest job by ID. Required after every memoo_create_episode (always async).",
      inputSchema: {
        job_id: z.string().describe("Job UUID returned by memoo_create_episode"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        const jobId = args.job_id.trim();
        if (!jobId) throw new Error("job_id is required");
        const out = await client.getJob(apiKey(), jobId);
        return textResult(out);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "memoo_delete_episode",
    {
      title: "Delete Episode",
      description: "Delete an episode by ID from a namespace.",
      inputSchema: {
        namespace: z.string().optional().describe(nsDesc(config.defaultNamespace)),
        id: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const namespace = ns(args.namespace);
        const id = args.id.trim();
        if (!id) throw new Error("id is required");
        await client.deleteEpisode(apiKey(), namespace, id);
        return textResult({ deleted: true, namespace, id });
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}

export function registerResources(server: McpServer, runtime: Runtime): void {
  const { client } = runtime;
  const apiKey = () => {
    const key = runtime.apiKey.trim();
    if (!key) throw new Error("missing API key");
    return key;
  };

  server.registerResource(
    "namespaces",
    "memoo://namespaces",
    {
      title: "Namespace Catalog",
      description: "List of accessible Memoo namespaces for the API key.",
      mimeType: "application/json",
    },
    async (uri) => {
      const raw = await client.listNamespaces(apiKey());
      const namespaces = normalizeNamespaces(raw);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({ namespaces, count: namespaces.length }, null, 2),
          },
        ],
      };
    },
  );

  server.registerResource(
    "health",
    "memoo://health",
    {
      title: "Memoo Health",
      description: "Gateway diagnostic health payload from Memoo API.",
      mimeType: "application/json",
    },
    async (uri) => {
      let health: JsonObject;
      try {
        health = await client.checkHealth();
      } catch (err) {
        health = {
          status: "unhealthy",
          error: err instanceof Error ? err.message : String(err),
        };
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(health, null, 2),
          },
        ],
      };
    },
  );

  server.registerResource(
    "episode-detail",
    new ResourceTemplate("memoo://episodes/{namespace}/{id}", {
      list: undefined,
    }),
    {
      title: "Episode Detail",
      description: "Read a full episode payload by namespace and episode ID.",
      mimeType: "application/json",
    },
    async (uri, vars) => {
      const namespace = String(vars.namespace ?? "").trim();
      const id = String(vars.id ?? "").trim();
      if (!namespace || !id) {
        throw new Error(`invalid episode URI: ${uri.href}`);
      }
      const episode = await client.getEpisode(apiKey(), namespace, id);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(episode, null, 2),
          },
        ],
      };
    },
  );
}
