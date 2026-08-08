import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildMcpServer, SERVER_NAME, SERVER_VERSION } from "./create-mcp.js";
import { buildServerInstructions } from "./instructions.js";
import { countWords, MemooApiError } from "./memoo/errors.js";
import { getPackageMeta, getPackageName, getPackageVersion } from "./package-meta.js";
import { createRuntime } from "./runtime.js";

describe("package-meta", () => {
  it("reads name and version from package.json", () => {
    const meta = getPackageMeta();
    assert.equal(meta.name, "memoo-mcp");
    assert.match(meta.version, /^\d+\.\d+\.\d+/);
    assert.equal(getPackageName(), meta.name);
    assert.equal(getPackageVersion(), meta.version);
  });
});

describe("errors", () => {
  it("MemooApiError and countWords", () => {
    const err = new MemooApiError(413, "too big");
    assert.equal(err.statusCode, 413);
    assert.equal(err.name, "MemooApiError");
    assert.equal(countWords(""), 0);
    assert.equal(countWords("  one two  three "), 3);
  });
});

describe("runtime + create-mcp", () => {
  it("createRuntime wires client", () => {
    const rt = createRuntime({
      apiKey: "moo_sk_x",
      apiKeyPrefix: "moo_sk",
      baseUrl: "https://example.test/",
      defaultNamespace: "ns",
      timeoutMs: 1000,
      host: "127.0.0.1",
      port: 8787,
    });
    assert.equal(rt.apiKey, "moo_sk_x");
    assert.equal(rt.client.baseUrl, "https://example.test");
  });

  it("buildMcpServer uses package version", () => {
    const rt = createRuntime({
      apiKey: "moo_sk_x",
      apiKeyPrefix: "moo_sk",
      baseUrl: "https://example.test",
      defaultNamespace: "ns",
      timeoutMs: 1000,
      host: "127.0.0.1",
      port: 8787,
    });
    const server = buildMcpServer(rt);
    assert.ok(server);
    assert.equal(SERVER_NAME, "memoo-mcp");
    assert.match(SERVER_VERSION, /^\d+\.\d+\.\d+/);
  });
});

describe("instructions", () => {
  it("buildServerInstructions mentions namespace", () => {
    const text = buildServerInstructions("testing");
    assert.match(text, /testing/);
  });
});
