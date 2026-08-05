# Security

## API keys

- Memoo MCP accepts **only** Memoo API keys with prefix `moo_sk` (configurable via `MEMOO_API_KEY_PREFIX`).
- **Never** commit `.env` or paste live keys into chat, issues, or MCP config that is shared.
- Prefer host-level secret storage (Cursor/Claude env) over repo-local files.
- Rotate keys in the Memoo UI/API if a key may have leaked.

## Transports

- **stdio:** API key comes from `MEMOO_API_KEY` / `--api-key`. Stdio boot validates prefix, upstream `/health/detail`, and a lightweight authenticated call.
- **HTTP:** Prefer `Authorization: Bearer moo_sk…` per request. Falling back to process env `MEMOO_API_KEY` is convenient for local bind only (`127.0.0.1`). Do not expose HTTP without TLS and network controls in production.
- Default Origin policy (empty allowlist): localhost / `127.0.0.1` / `::1` only. Use `MEMOO_ALLOWED_ORIGINS` or `--allowed-origin` deliberately.

## Scope

This gateway does **not** expose admin/user/provider mutation tools. Episode delete is destructive—hosts should confirm before calling `memoo_delete_episode`.

## Upstream trust

All tool I/O goes to `MEMOO_BASE_URL`. Point it only at Memoo instances you trust.
