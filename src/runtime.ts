import type { MemooConfig } from "./config.js";
import { MemooClient } from "./memoo/client.js";

export type Runtime = {
  config: MemooConfig;
  client: MemooClient;
  /** Effective API key for this session (stdio env or HTTP Bearer). */
  apiKey: string;
};

export function createRuntime(
  config: MemooConfig,
  apiKey?: string,
  fetchImpl?: typeof fetch,
): Runtime {
  const key = (apiKey ?? config.apiKey).trim();
  return {
    config,
    apiKey: key,
    client: new MemooClient({
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs,
      apiKeyPrefix: config.apiKeyPrefix,
      fetchImpl,
    }),
  };
}
