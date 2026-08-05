import { validateApiKey } from "../config.js";
import { MemooApiError } from "./errors.js";
import type { JsonObject } from "./types.js";

export type MemooClientOptions = {
  baseUrl: string;
  timeoutMs: number;
  apiKeyPrefix: string;
  fetchImpl?: typeof fetch;
};

function parseErrorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as JsonObject;
    const msg =
      (typeof parsed.message === "string" && parsed.message) ||
      (typeof parsed.error === "string" && parsed.error) ||
      (typeof (parsed.error as JsonObject | undefined)?.message === "string" &&
        ((parsed.error as JsonObject).message as string)) ||
      "";
    return msg;
  } catch {
    return body.slice(0, 500);
  }
}

export class MemooClient {
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly apiKeyPrefix: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: MemooClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.timeoutMs = opts.timeoutMs;
    this.apiKeyPrefix = opts.apiKeyPrefix;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async doJSON<T = unknown>(
    apiKey: string,
    method: string,
    path: string,
    query?: Record<string, string | number | undefined>,
    body?: unknown,
  ): Promise<T> {
    validateApiKey(apiKey, this.apiKeyPrefix);

    const url = new URL(this.baseUrl + path);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === "") continue;
        url.searchParams.set(k, String(v));
      }
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    };
    let payload: string | undefined;
    if (body !== undefined && body !== null) {
      payload = JSON.stringify(body);
      headers["Content-Type"] = "application/json";
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(url, {
        method,
        headers,
        body: payload,
        signal: controller.signal,
      });
      const text = await res.text();
      if (res.status >= 400) {
        throw new MemooApiError(
          res.status,
          parseErrorMessage(text) || res.statusText,
        );
      }
      if (!text) return undefined as T;
      return JSON.parse(text) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  checkHealth(): Promise<JsonObject> {
    // Health endpoints are public; still use fetch without auth requirement
    return this.fetchPublic("/health/detail");
  }

  private async fetchPublic(path: string): Promise<JsonObject> {
    const url = this.baseUrl + path;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      const text = await res.text();
      if (res.status >= 400) {
        throw new MemooApiError(
          res.status,
          parseErrorMessage(text) || res.statusText,
        );
      }
      return text ? (JSON.parse(text) as JsonObject) : {};
    } finally {
      clearTimeout(timer);
    }
  }

  listNamespaces(apiKey: string, limit = 20, offset = 0) {
    return this.doJSON<unknown>(apiKey, "GET", "/api/v1/namespaces", {
      limit,
      offset,
    });
  }

  /** GET /api/v1/namespaces/{id|name} — detail by UUID or name (not list). */
  getNamespace(apiKey: string, identifier: string) {
    const id = identifier.trim();
    return this.doJSON<JsonObject>(
      apiKey,
      "GET",
      `/api/v1/namespaces/${encodeURIComponent(id)}`,
    );
  }

  /**
   * Resolve UUID or name to the canonical namespace name via detail endpoint.
   * Prefer this over listNamespaces for boot / default-namespace setup.
   */
  async resolveNamespaceName(
    apiKey: string,
    identifier: string,
  ): Promise<string> {
    const id = identifier.trim();
    if (!id) throw new Error("namespace identifier is empty");
    try {
      const ns = await this.getNamespace(apiKey, id);
      const name = typeof ns.name === "string" ? ns.name.trim() : "";
      if (!name) {
        throw new Error("invalid namespace response: missing name field");
      }
      return name;
    } catch (err) {
      if (err instanceof MemooApiError && err.statusCode === 404) {
        throw new Error(
          `namespace not found: ${id} - create namespace via API first (POST /api/v1/namespaces)`,
        );
      }
      if (err instanceof MemooApiError && err.statusCode === 401) {
        throw new Error(
          "API key validation failed: unauthorized - check your API key",
        );
      }
      throw err;
    }
  }

  listEpisodes(apiKey: string, ns: string, page = 1, pageSize = 20) {
    return this.doJSON<JsonObject>(
      apiKey,
      "GET",
      `/api/v1/namespaces/${encodeURIComponent(ns)}/episodes`,
      { page, page_size: pageSize },
    );
  }

  getEpisode(apiKey: string, ns: string, id: string) {
    return this.doJSON<JsonObject>(
      apiKey,
      "GET",
      `/api/v1/namespaces/${encodeURIComponent(ns)}/episodes/${encodeURIComponent(id)}`,
    );
  }

  search(
    apiKey: string,
    ns: string,
    body: {
      query: string;
      entity_types?: string[];
      limit?: number;
      min_relevance?: number;
    },
  ) {
    return this.doJSON<JsonObject>(
      apiKey,
      "POST",
      `/api/v1/namespaces/${encodeURIComponent(ns)}/search`,
      undefined,
      body,
    );
  }

  ask(
    apiKey: string,
    ns: string,
    body: { query: string; limit?: number; use_reranker?: boolean },
  ) {
    return this.doJSON<JsonObject>(
      apiKey,
      "POST",
      `/api/v1/namespaces/${encodeURIComponent(ns)}/ask`,
      undefined,
      body,
    );
  }

  graphTraverse(
    apiKey: string,
    ns: string,
    body: { entity_uuid: string; max_hops?: number },
  ) {
    return this.doJSON<JsonObject>(
      apiKey,
      "POST",
      `/api/v1/namespaces/${encodeURIComponent(ns)}/graph/traverse`,
      undefined,
      body,
    );
  }

  temporalQuery(
    apiKey: string,
    ns: string,
    body: { query: string; at_time: number; limit?: number },
  ) {
    return this.doJSON<JsonObject>(
      apiKey,
      "POST",
      `/api/v1/namespaces/${encodeURIComponent(ns)}/graph/temporal`,
      undefined,
      body,
    );
  }

  createEpisode(
    apiKey: string,
    ns: string,
    body: {
      name?: string;
      content: string;
      source?: string;
      source_id?: string;
      metadata?: Record<string, string>;
    },
  ) {
    return this.doJSON<JsonObject>(
      apiKey,
      "POST",
      `/api/v1/namespaces/${encodeURIComponent(ns)}/episodes`,
      undefined,
      body,
    );
  }

  deleteEpisode(apiKey: string, ns: string, id: string) {
    return this.doJSON<void>(
      apiKey,
      "DELETE",
      `/api/v1/namespaces/${encodeURIComponent(ns)}/episodes/${encodeURIComponent(id)}`,
    );
  }

  getJob(apiKey: string, jobId: string) {
    return this.doJSON<JsonObject>(
      apiKey,
      "GET",
      `/api/v1/jobs/${encodeURIComponent(jobId)}`,
    );
  }

  /**
   * Validate API key via namespace detail when an identifier is known.
   * Avoids GET /api/v1/namespaces (list), which confuses agents with many rows.
   */
  async validateApiKeyWithUpstream(
    apiKey: string,
    namespaceIdentifier?: string | null,
  ): Promise<void> {
    const id = namespaceIdentifier?.trim();
    if (id) {
      await this.resolveNamespaceName(apiKey, id);
      return;
    }
    // Fallback only when no default namespace: minimal list probe
    await this.listNamespaces(apiKey, 1, 0);
  }
}
