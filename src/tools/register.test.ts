import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MemooClient } from "../memoo/client.js";
import { MemooApiError } from "../memoo/errors.js";
import type { Runtime } from "../runtime.js";
import { registerMeta } from "./meta.js";
import { mapApiError, registerResources, registerTools } from "./register.js";

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

type ResourceHandler = (uri: URL, vars?: Record<string, string | string[]>) => Promise<unknown>;

function mockServer() {
  const tools = new Map<string, ToolHandler>();
  const resources = new Map<string, ResourceHandler>();
  const prompts = new Map<string, (args: Record<string, string>) => Promise<unknown>>();
  const server = {
    registerTool: (name: string, _meta: unknown, handler: ToolHandler) => {
      tools.set(name, handler);
    },
    registerResource: (name: string, _uri: unknown, _meta: unknown, handler: ResourceHandler) => {
      resources.set(name, handler);
    },
    registerPrompt: (
      name: string,
      _meta: unknown,
      handler: (args: Record<string, string>) => Promise<unknown>,
    ) => {
      prompts.set(name, handler);
    },
  } as unknown as McpServer;
  return { server, tools, resources, prompts };
}

function mockRuntime(overrides: Partial<MemooClient> = {}): Runtime {
  const client = {
    search: async () => ({ results: [{ id: "1" }], next_cursor: null }),
    getEpisode: async () => ({ id: "ep1", content: "hi" }),
    listNamespaces: async () => ({ namespaces: [{ name: "ns" }] }),
    listEpisodes: async () => ({ episodes: [] }),
    ask: async () => ({ answer: "ok" }),
    graphTraverse: async () => ({ nodes: [] }),
    temporalQuery: async () => ({ results: [] }),
    createEpisode: async () => ({ job_id: "job-1" }),
    getJob: async () => ({ status: "completed" }),
    deleteEpisode: async () => undefined,
    checkHealth: async () => ({ status: "healthy" }),
    ...overrides,
  } as unknown as MemooClient;

  return {
    apiKey: "moo_sk_test",
    config: {
      apiKey: "moo_sk_test",
      apiKeyPrefix: "moo_sk",
      baseUrl: "https://example.test",
      defaultNamespace: "testing",
      timeoutMs: 30_000,
      host: "127.0.0.1",
      port: 8787,
    },
    client,
  };
}

describe("mapApiError", () => {
  it("maps status codes", () => {
    assert.match(mapApiError(new MemooApiError(401, "no")).message, /authorization/);
    assert.match(mapApiError(new MemooApiError(403, "no")).message, /authorization/);
    assert.match(mapApiError(new MemooApiError(404, "x")).message, /not found/);
    assert.match(mapApiError(new MemooApiError(400, "x")).message, /invalid input/);
    assert.match(mapApiError(new MemooApiError(413, "big")).message, /Summarize/);
    assert.match(mapApiError(new MemooApiError(500, "x")).message, /memoo api/);
    assert.match(mapApiError(new Error("plain")).message, /plain/);
    assert.match(mapApiError("raw").message, /raw/);
  });
});

describe("registerTools", () => {
  it("registers and runs core tools", async () => {
    const { server, tools } = mockServer();
    registerTools(server, mockRuntime());

    const names = [
      "search",
      "fetch",
      "memoo_list_namespaces",
      "memoo_list_episodes",
      "memoo_search",
      "memoo_ask",
      "memoo_graph_traverse",
      "memoo_temporal_query",
      "memoo_create_episode",
      "memoo_get_job_status",
      "memoo_delete_episode",
    ];
    for (const name of names) {
      assert.ok(tools.has(name), `missing tool ${name}`);
    }

    const search = await tools.get("search")!({ query: "auth" });
    assert.equal(search.isError, undefined);
    assert.match(search.content[0].text, /auth/);

    const emptyQuery = await tools.get("search")!({ query: "  " });
    assert.equal(emptyQuery.isError, true);

    const fetchEp = await tools.get("fetch")!({ id: "ep1" });
    assert.match(fetchEp.content[0].text, /ep1/);

    const namespaces = await tools.get("memoo_list_namespaces")!({});
    assert.match(namespaces.content[0].text, /testing|ns|namespaces/i);

    const episodes = await tools.get("memoo_list_episodes")!({});
    assert.ok(episodes.content[0].text);

    const ask = await tools.get("memoo_ask")!({ query: "what?" });
    assert.match(ask.content[0].text, /ok/);

    const graph = await tools.get("memoo_graph_traverse")!({
      entity_uuid: "u1",
    });
    assert.ok(graph.content[0].text);

    const temporal = await tools.get("memoo_temporal_query")!({
      query: "q",
      at_time: 1,
    });
    assert.ok(temporal.content[0].text);

    const created = await tools.get("memoo_create_episode")!({
      content: "summary of facts",
    });
    assert.match(created.content[0].text, /job-1/);

    const job = await tools.get("memoo_get_job_status")!({ job_id: "job-1" });
    assert.match(job.content[0].text, /completed/);

    const deleted = await tools.get("memoo_delete_episode")!({ id: "ep1" });
    assert.match(deleted.content[0].text, /deleted/);
  });

  it("create episode errors without job_id", async () => {
    const { server, tools } = mockServer();
    registerTools(
      server,
      mockRuntime({
        createEpisode: async () => ({}),
      } as Partial<MemooClient>),
    );
    const out = await tools.get("memoo_create_episode")!({ content: "x" });
    assert.equal(out.isError, true);
  });

  it("surfaces MemooApiError via errorResult", async () => {
    const { server, tools } = mockServer();
    registerTools(
      server,
      mockRuntime({
        search: async () => {
          throw new MemooApiError(404, "missing");
        },
      } as Partial<MemooClient>),
    );
    const out = await tools.get("memoo_search")!({ query: "x" });
    assert.equal(out.isError, true);
    assert.match(out.content[0].text, /not found/);
  });
});

describe("registerResources + meta", () => {
  it("serves namespaces and health resources", async () => {
    const { server, resources, prompts } = mockServer();
    const runtime = mockRuntime();
    registerResources(server, runtime);
    registerMeta(server);

    const ns = await resources.get("namespaces")!(new URL("memoo://namespaces"));
    assert.ok(ns);

    const health = await resources.get("health")!(new URL("memoo://health"));
    assert.ok(health);

    const episode = await resources.get("episode-detail")!(
      new URL("memoo://episodes/testing/ep1"),
      { namespace: "testing", id: "ep1" },
    );
    assert.ok(episode);

    assert.ok(resources.has("workflow"));
    assert.ok(resources.has("instructions"));
    const workflow = await resources.get("workflow")!(new URL("memoo://docs/workflow"));
    assert.ok(workflow);
    const instructions = await resources.get("instructions")!(new URL("memoo://docs/instructions"));
    assert.ok(instructions);
    const prompt = await prompts.get("memoo_explore")!({ topic: "auth" });
    assert.ok(prompt);
  });

  it("health resource reports unhealthy on client failure", async () => {
    const { server, resources } = mockServer();
    registerResources(
      server,
      mockRuntime({
        checkHealth: async () => {
          throw new Error("down");
        },
      } as Partial<MemooClient>),
    );
    const health = (await resources.get("health")!(new URL("memoo://health"))) as {
      contents: Array<{ text: string }>;
    };
    assert.match(health.contents[0].text, /unhealthy|down/);
  });

  it("listNamespaces normalizes array and results shapes", async () => {
    const { server, tools } = mockServer();
    registerTools(
      server,
      mockRuntime({
        listNamespaces: async () => [{ name: "a" }],
      } as Partial<MemooClient>),
    );
    const out = await tools.get("memoo_list_namespaces")!({});
    assert.match(out.content[0].text, /"a"/);

    const { server: s2, tools: t2 } = mockServer();
    registerTools(
      s2,
      mockRuntime({
        listNamespaces: async () => ({ results: [{ name: "b" }] }),
      } as Partial<MemooClient>),
    );
    const out2 = await t2.get("memoo_list_namespaces")!({});
    assert.match(out2.content[0].text, /"b"/);
  });

  it("tool validation branches for empty ids", async () => {
    const { server, tools } = mockServer();
    registerTools(server, mockRuntime());
    assert.equal((await tools.get("fetch")!({ id: " " })).isError, true);
    assert.equal((await tools.get("memoo_ask")!({ query: "" })).isError, true);
    assert.equal((await tools.get("memoo_graph_traverse")!({ entity_uuid: "" })).isError, true);
    assert.equal(
      (await tools.get("memoo_temporal_query")!({ query: "q", at_time: 0 })).isError,
      true,
    );
    assert.equal((await tools.get("memoo_create_episode")!({ content: "" })).isError, true);
    assert.equal((await tools.get("memoo_get_job_status")!({ job_id: "" })).isError, true);
    assert.equal((await tools.get("memoo_delete_episode")!({ id: "" })).isError, true);
  });
});
