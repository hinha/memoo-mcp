import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig, parseTimeoutMs, resolveNamespace, validateApiKey } from "./config.js";
import { countWords } from "./memoo/errors.js";

describe("config", () => {
  it("validateApiKey enforces prefix", () => {
    assert.doesNotThrow(() => validateApiKey("moo_sk_abc", "moo_sk"));
    assert.throws(() => validateApiKey("x", "moo_sk"), /prefix/);
    assert.throws(() => validateApiKey("", "moo_sk"), /missing/);
  });

  it("resolveNamespace prefers arg then default", () => {
    assert.equal(resolveNamespace("a", "b"), "a");
    assert.equal(resolveNamespace(undefined, "b"), "b");
    assert.throws(() => resolveNamespace(undefined, null), /required/);
  });

  it("parseTimeoutMs accepts Go-style durations", () => {
    assert.equal(parseTimeoutMs("600s"), 600_000);
    assert.equal(parseTimeoutMs("5m"), 300_000);
    assert.equal(parseTimeoutMs("300000"), 300_000);
    assert.equal(parseTimeoutMs("100ms"), 100);
    assert.equal(parseTimeoutMs("1h"), 3_600_000);
    assert.equal(parseTimeoutMs(""), 300_000);
    assert.equal(parseTimeoutMs("nope"), 300_000);
    assert.equal(parseTimeoutMs("-1"), 300_000);
  });

  it("loadConfig reads = flags and timeout-ms", () => {
    const prev = process.env.MEMOO_API_KEY;
    delete process.env.MEMOO_API_KEY;
    const cfg = loadConfig([
      "--memoo-base-url=https://example.test/",
      "--memoo-namespace=named-ns",
      "--timeout-ms",
      "45000",
      "--api-key-prefix",
      "moo_sk",
    ]);
    assert.equal(cfg.baseUrl, "https://example.test");
    assert.equal(cfg.defaultNamespace, "named-ns");
    assert.equal(cfg.timeoutMs, 45_000);
    if (prev !== undefined) process.env.MEMOO_API_KEY = prev;
  });

  it("loadConfig applies defaults and Go-compatible flags", () => {
    const prev = process.env.MEMOO_API_KEY;
    delete process.env.MEMOO_API_KEY;
    const cfg = loadConfig([
      "--memoo-base-url",
      "https://memoo.hinha.web.id",
      "--memo-namespace",
      "0b00322d-f6ed-45b7-a2e8-b7059f71de34",
      "--timeout",
      "600s",
    ]);
    assert.equal(cfg.baseUrl, "https://memoo.hinha.web.id");
    assert.equal(cfg.defaultNamespace, "0b00322d-f6ed-45b7-a2e8-b7059f71de34");
    assert.equal(cfg.timeoutMs, 600_000);
    assert.equal(cfg.apiKeyPrefix, "moo_sk");
    assert.equal(cfg.port, 8787);
    if (prev !== undefined) process.env.MEMOO_API_KEY = prev;
  });
});

describe("countWords", () => {
  it("counts whitespace-separated words", () => {
    assert.equal(countWords(""), 0);
    assert.equal(countWords("  one two  three "), 3);
  });
});
