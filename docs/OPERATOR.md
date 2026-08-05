# Operator guide

## Local development

```bash
cp .env.example .env
# set MEMOO_API_KEY + MEMOO_NAMESPACE (UUID or name)
npm install
npm run typecheck
npm test
npm run build
npm run stdio          # MCP over stdio
npm run serve          # Streamable HTTP on 127.0.0.1:8787/mcp
```

Stdio boot resolves `--memo-namespace` / `MEMOO_NAMESPACE` with
`GET /api/v1/namespaces/{id}` (detail) and stores the **name** as the tool default.
It does not call list-namespaces for that step.

Cursor/Codex/Claude example (same flags as the Go gateway):

```json
{
  "command": "node",
  "args": [
    "/Users/hinha/Projects/hinha/memoo-mcp/dist/index.js",
    "--memoo-base-url", "https://memoo.hinha.web.id",
    "--memo-namespace", "0b00322d-f6ed-45b7-a2e8-b7059f71de34",
    "--timeout", "600s"
  ],
  "env": { "MEMOO_API_KEY": "moo_sk_…" }
}
```

`bin/run-mcp.sh` runs the built `dist/index.js` (build first).

## Publishing (optional follow-up)

npm publish is **out of scope** for the rewrite; document `npx memoo-mcp@latest` once published. Until then, point hosts at a local clone:

```json
{
  "command": "node",
  "args": ["/absolute/path/to/memoo-mcp/dist/index.js"],
  "env": { "MEMOO_API_KEY": "moo_sk_…", "MEMOO_NAMESPACE": "…" }
}
```

## Health

- Resource `memoo://health` and HTTP `GET /health` (gateway liveness).
- Stdio startup requires upstream `GET /health/detail` with `status: healthy`.

## Async ingest

1. `memoo_create_episode` → `{ job_id, status: "queued", next_action: "poll_with_memoo_get_job_status" }`
2. Poll `memoo_get_job_status` until `completed` / `failed`
3. Word limit is **not** hardcoded in MCP. Memoo API enforces `episode_content_words` (auth plan entitlement via auth-sdks; config fallback `namespaces.episode.max_content_words`, default 1200). On HTTP 413, agent should summarize and retry.

## HTTP sessions (memory)

- Each Streamable HTTP initialize creates an `McpServer` + transport entry.
- Entries are removed on transport `onclose` / DELETE (and `server.close()`).
- Idle sessions are evicted after **30 minutes** (sweep every 60s, `unref` so it won't keep Node alive alone).
- Stdio has no session map (single process lifetime tied to the host).

## Relation to Go gateway

Monorepo Go binary + `@hinha/memoo` wrapper remain available but **deprecated**. New installs and skills should use this TypeScript package.

## TODO (optional follow-ups)

- [ ] MCP: optional `GET /api/v1/me/plan` (or usage) at tool/boot to surface the caller's exact `episode_content_words` limit in server instructions / create-episode schema description.
- [ ] Go gateway (`api/cmd/mcp-gateway`): still documents a hardcoded 900-word client check — align or remove when touching that path (deprecated).
- [ ] Soft client warn at ~300 words (config `warn_content_words`) without rejecting — optional UX only; authority stays on API.
