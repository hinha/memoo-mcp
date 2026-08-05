export function buildServerInstructions(defaultNamespace: string | null): string {
  const ns = defaultNamespace?.trim() || "";
  const nsBlock = ns
    ? `Default namespace (already resolved at startup): "${ns}"
- Omit the "namespace" tool argument; the gateway fills this default.
- Do NOT call memoo_list_namespaces unless the user explicitly asks to switch or list other namespaces.
- Do NOT pass raw UUIDs when the default name is already set.`
    : `Before tools that need a namespace:
- Pass "namespace" (name or UUID) in the tool args, OR set MEMOO_NAMESPACE / --memo-namespace.
- Prefer GET detail resolution (configured default) over memoo_list_namespaces.`;

  return `Memoo MCP exposes a Graphiti-backed knowledge graph over the Memoo REST API.

Auth: API key only (moo_sk…). JWT is not accepted.

${nsBlock}

Async ingest (always — no sync create):
1. memoo_create_episode → always returns job_id (HTTP 202)
2. Poll memoo_get_job_status(job_id) until completed or failed; episode_id is on the completed job, not the create response
3. Always summarize before create. Word max is Memoo API entitlement episode_content_words (plan-based; config fallback ~1200). Prefer ≤300 words. On 413, summarize further and retry.

Read tools: search, fetch, memoo_list_episodes, memoo_search, memoo_ask, memoo_graph_traverse, memoo_temporal_query${ns ? "" : ", memoo_list_namespaces"}.
Write tools: memoo_create_episode, memoo_delete_episode (destructive).
Resources: memoo://health, memoo://episodes/{namespace}/{id}${ns ? "" : ", memoo://namespaces"}.
`;
}

/** @deprecated Prefer buildServerInstructions(defaultNamespace) */
export const SERVER_INSTRUCTIONS = buildServerInstructions(null);

export const WORKFLOW_DOC = `# Memoo MCP workflow

1. Ensure MEMOO_API_KEY is set (prefix moo_sk).
2. Set --memo-namespace (UUID or name). Gateway resolves via GET /api/v1/namespaces/{id} (detail), not list.
3. Explore with memoo_search / memoo_ask / memoo_graph_traverse using the resolved default namespace.
4. Ingest only summarized episodes; create is always async — poll memoo_get_job_status after every create. Word limit is plan entitlement episode_content_words (API-enforced).
5. Call memoo_list_namespaces only when you need to discover other namespaces.
`;
