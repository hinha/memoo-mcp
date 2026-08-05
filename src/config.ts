import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type MemooConfig = {
  apiKey: string;
  apiKeyPrefix: string;
  baseUrl: string;
  defaultNamespace: string | null;
  timeoutMs: number;
  host: string;
  port: number;
};

function loadDotEnv(): void {
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(import.meta.dirname, "../../.env"),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
    break;
  }
}

function firstNonEmpty(...values: Array<string | undefined | null>): string {
  for (const v of values) {
    const t = v?.trim();
    if (t) return t;
  }
  return "";
}

function parseArg(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(name);
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1];
  const pref = `${name}=`;
  const hit = argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : undefined;
}

/** Parse Go-style durations (`600s`, `5m`, `1h`) or plain milliseconds. */
export function parseTimeoutMs(raw: string, fallback = 300_000): number {
  const t = raw.trim().toLowerCase();
  if (!t) return fallback;
  const asNum = Number(t);
  if (Number.isFinite(asNum) && asNum > 0) return asNum;
  const m = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/.exec(t);
  if (!m) return fallback;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  switch (m[2]) {
    case "ms":
      return Math.round(n);
    case "s":
      return Math.round(n * 1000);
    case "m":
      return Math.round(n * 60_000);
    case "h":
      return Math.round(n * 3_600_000);
    default:
      return fallback;
  }
}

export function validateApiKey(token: string, prefix: string): void {
  const t = token.trim();
  const p = prefix.trim() || "moo_sk";
  if (!t) throw new Error("missing API key (set MEMOO_API_KEY)");
  if (!t.startsWith(p)) {
    throw new Error(`API key must start with prefix "${p}"`);
  }
}

/** Load config from env + CLI flags. Does not require apiKey for HTTP serve (per-request Bearer). */
export function loadConfig(argv: string[] = process.argv.slice(2)): MemooConfig {
  loadDotEnv();
  const apiKeyPrefix = firstNonEmpty(
    parseArg(argv, "--api-key-prefix"),
    process.env.MEMOO_API_KEY_PREFIX,
    "moo_sk",
  );
  const apiKey = firstNonEmpty(
    parseArg(argv, "--api-key"),
    process.env.MEMOO_API_KEY,
  );
  const baseUrl = firstNonEmpty(
    parseArg(argv, "--memoo-base-url"),
    process.env.MEMOO_BASE_URL,
    "https://memoo.hinha.web.id",
  ).replace(/\/+$/, "");
  const defaultNamespace =
    firstNonEmpty(
      parseArg(argv, "--memo-namespace"),
      parseArg(argv, "--memoo-namespace"),
      process.env.MEMOO_NAMESPACE,
    ) || null;
  const timeoutRaw = firstNonEmpty(
    parseArg(argv, "--timeout"),
    parseArg(argv, "--timeout-ms"),
    process.env.MEMOO_TIMEOUT,
    process.env.MEMOO_TIMEOUT_MS,
    "300000",
  );
  const timeoutMs = parseTimeoutMs(timeoutRaw, 300_000);
  const host = firstNonEmpty(process.env.MEMOO_HOST, "127.0.0.1");
  const port = Number(firstNonEmpty(process.env.MEMOO_PORT, "8787"));

  return {
    apiKey,
    apiKeyPrefix,
    baseUrl,
    defaultNamespace,
    timeoutMs,
    host,
    port: Number.isFinite(port) && port > 0 ? port : 8787,
  };
}

export function resolveNamespace(
  provided: string | undefined,
  defaultNamespace: string | null,
): string {
  const p = provided?.trim() ?? "";
  if (p) return p;
  const d = defaultNamespace?.trim() ?? "";
  if (d) return d;
  throw new Error(
    "namespace is required — set MEMOO_NAMESPACE or pass namespace in the tool call",
  );
}
