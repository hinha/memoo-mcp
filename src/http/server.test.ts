import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MemooConfig } from "../config.js";
import {
  extractBearerToken,
  HTTP_MCP_PATH,
  isOriginAllowed,
  parseAllowedOrigins,
  resolveHttpApiKey,
} from "./server.js";

const baseConfig = (): MemooConfig => ({
  apiKey: "",
  apiKeyPrefix: "moo_sk",
  baseUrl: "https://memoo.hinha.web.id",
  defaultNamespace: "ns",
  timeoutMs: 30_000,
  host: "127.0.0.1",
  port: 8787,
});

describe("http/server helpers", () => {
  it("HTTP_MCP_PATH is fixed", () => {
    assert.equal(HTTP_MCP_PATH, "/mcp");
  });

  it("extractBearerToken parses Bearer", () => {
    assert.equal(extractBearerToken("Bearer moo_sk_abc"), "moo_sk_abc");
    assert.throws(() => extractBearerToken("Basic x"), /Bearer/);
    assert.throws(() => extractBearerToken(undefined), /Bearer/);
  });

  it("isOriginAllowed defaults to localhost", () => {
    assert.equal(isOriginAllowed("http://localhost:3000", []), true);
    assert.equal(isOriginAllowed("http://127.0.0.1:8787", []), true);
    assert.equal(isOriginAllowed("https://evil.example", []), false);
    assert.equal(isOriginAllowed("", []), true);
  });

  it("isOriginAllowed respects allowlist", () => {
    assert.equal(isOriginAllowed("https://app.example", ["*"]), true);
    assert.equal(isOriginAllowed("https://app.example/x", ["https://app.example*"]), true);
    assert.equal(isOriginAllowed("https://app.example", ["https://app.example"]), true);
    assert.equal(isOriginAllowed("https://other.example", ["https://app.example"]), false);
  });

  it("parseAllowedOrigins from argv and env", () => {
    const prev = process.env.MEMOO_ALLOWED_ORIGINS;
    delete process.env.MEMOO_ALLOWED_ORIGINS;
    assert.deepEqual(parseAllowedOrigins(["--allowed-origin", "https://a.test"]), [
      "https://a.test",
    ]);
    assert.deepEqual(parseAllowedOrigins(["--allowed-origin=https://b.test"]), ["https://b.test"]);
    process.env.MEMOO_ALLOWED_ORIGINS = "https://c.test, https://d.test";
    assert.deepEqual(parseAllowedOrigins([]), ["https://c.test", "https://d.test"]);
    if (prev === undefined) delete process.env.MEMOO_ALLOWED_ORIGINS;
    else process.env.MEMOO_ALLOWED_ORIGINS = prev;
  });

  it("resolveHttpApiKey prefers Bearer then env key", () => {
    const cfg = baseConfig();
    const fromHeader = resolveHttpApiKey(
      { headers: { authorization: "Bearer moo_sk_hdr" } } as import("express").Request,
      cfg,
    );
    assert.equal(fromHeader, "moo_sk_hdr");

    cfg.apiKey = "moo_sk_env";
    const fromEnv = resolveHttpApiKey({ headers: {} } as import("express").Request, cfg);
    assert.equal(fromEnv, "moo_sk_env");

    cfg.apiKey = "";
    assert.throws(
      () => resolveHttpApiKey({ headers: {} } as import("express").Request, cfg),
      /Bearer/,
    );
  });
});
