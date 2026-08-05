import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MemooClient } from "./client.js";
import { MemooApiError } from "./errors.js";

function mockFetch(
  handler: (url: string, init?: RequestInit) => Promise<Response> | Response,
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    return handler(url, init);
  }) as typeof fetch;
}

describe("MemooClient", () => {
  it("sends Bearer auth and parses JSON success", async () => {
    let seenAuth = "";
    let seenUrl = "";
    const client = new MemooClient({
      baseUrl: "https://memoo.example",
      timeoutMs: 5_000,
      apiKeyPrefix: "moo_sk",
      fetchImpl: mockFetch((url, init) => {
        seenUrl = url;
        seenAuth = String(
          (init?.headers as Record<string, string>)?.Authorization ?? "",
        );
        return new Response(JSON.stringify({ results: [{ name: "ns1" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    });

    const out = await client.listNamespaces("moo_sk_test", 1, 0);
    assert.equal(seenAuth, "Bearer moo_sk_test");
    assert.match(seenUrl, /\/api\/v1\/namespaces\?limit=1&offset=0$/);
    assert.deepEqual(out, { results: [{ name: "ns1" }] });
  });

  it("rejects keys without required prefix", async () => {
    const client = new MemooClient({
      baseUrl: "https://memoo.example",
      timeoutMs: 5_000,
      apiKeyPrefix: "moo_sk",
      fetchImpl: mockFetch(() => new Response("{}")),
    });
    await assert.rejects(
      () => client.listNamespaces("bad_key"),
      /must start with prefix/,
    );
  });

  it("maps 4xx to MemooApiError", async () => {
    const client = new MemooClient({
      baseUrl: "https://memoo.example",
      timeoutMs: 5_000,
      apiKeyPrefix: "moo_sk",
      fetchImpl: mockFetch(
        () =>
          new Response(JSON.stringify({ message: "nope" }), { status: 401 }),
      ),
    });
    await assert.rejects(
      () => client.search("moo_sk_x", "ns", { query: "hi" }),
      (err: unknown) => {
        assert.ok(err instanceof MemooApiError);
        assert.equal(err.statusCode, 401);
        assert.match(err.message, /nope/);
        return true;
      },
    );
  });

  it("posts search body", async () => {
    let method = "";
    let body = "";
    const client = new MemooClient({
      baseUrl: "https://memoo.example",
      timeoutMs: 5_000,
      apiKeyPrefix: "moo_sk",
      fetchImpl: mockFetch((url, init) => {
        method = init?.method ?? "";
        body = String(init?.body ?? "");
        assert.match(url, /\/namespaces\/demo\/search$/);
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }),
    });
    await client.search("moo_sk_x", "demo", {
      query: "auth",
      limit: 5,
      min_relevance: 0.1,
    });
    assert.equal(method, "POST");
    assert.deepEqual(JSON.parse(body), {
      query: "auth",
      limit: 5,
      min_relevance: 0.1,
    });
  });

  it("checkHealth does not require API key", async () => {
    const client = new MemooClient({
      baseUrl: "https://memoo.example",
      timeoutMs: 5_000,
      apiKeyPrefix: "moo_sk",
      fetchImpl: mockFetch((url, init) => {
        assert.match(url, /\/health\/detail$/);
        assert.equal(
          (init?.headers as Record<string, string>)?.Authorization,
          undefined,
        );
        return new Response(JSON.stringify({ status: "healthy" }), {
          status: 200,
        });
      }),
    });
    const health = await client.checkHealth();
    assert.equal(health.status, "healthy");
  });

  it("resolveNamespaceName hits detail not list", async () => {
    const uuid = "0b00322d-f6ed-45b7-a2e8-b7059f71de34";
    let seenUrl = "";
    const client = new MemooClient({
      baseUrl: "https://memoo.example",
      timeoutMs: 5_000,
      apiKeyPrefix: "moo_sk",
      fetchImpl: mockFetch((url) => {
        seenUrl = url;
        assert.doesNotMatch(url, /\?/);
        return new Response(
          JSON.stringify({
            id: 1,
            uuid,
            name: "prod-kg",
          }),
          { status: 200 },
        );
      }),
    });
    const name = await client.resolveNamespaceName("moo_sk_x", uuid);
    assert.equal(name, "prod-kg");
    assert.match(
      seenUrl,
      /\/api\/v1\/namespaces\/0b00322d-f6ed-45b7-a2e8-b7059f71de34$/,
    );
    assert.doesNotMatch(seenUrl, /\/namespaces\?/);
  });

  it("validateApiKeyWithUpstream uses detail when namespace given", async () => {
    let seenUrl = "";
    const client = new MemooClient({
      baseUrl: "https://memoo.example",
      timeoutMs: 5_000,
      apiKeyPrefix: "moo_sk",
      fetchImpl: mockFetch((url) => {
        seenUrl = url;
        return new Response(JSON.stringify({ name: "ns-a" }), { status: 200 });
      }),
    });
    await client.validateApiKeyWithUpstream("moo_sk_x", "ns-a");
    assert.match(seenUrl, /\/api\/v1\/namespaces\/ns-a$/);
    assert.doesNotMatch(seenUrl, /limit=/);
  });
});
