# memoo-mcp

Memoo MCP server — knowledge graph RAG over the [Memoo](https://github.com/hinha/memoo) REST API, for Cursor, Claude, Codex, and other MCP hosts.

**Auth:** API key only (`moo_sk…`). No JWT. No OAuth.

```bash
npx -y memoo-mcp@latest --version
```

---

## Quick start

1. Get a Memoo API key (`moo_sk…`) and a namespace (UUID or name).
2. Add this to your MCP config (Cursor example — same shape works for Claude Desktop / Codex):

```json
{
  "mcpServers": {
    "memoo": {
      "command": "npx",
      "args": ["-y", "memoo-mcp@latest"],
      "env": {
        "MEMOO_API_KEY": "moo_sk_xxx",
        "MEMOO_NAMESPACE": "your-namespace",
        "MEMOO_BASE_URL": "https://memoo.hinha.web.id",
        "MEMOO_TIMEOUT": "600s"
      }
    }
  }
}
```

3. Restart the host. Tools like `memoo_search` and `memoo_ask` should appear.

That is enough for most users.

---

## Install options

| Method | When to use |
|--------|-------------|
| `npx -y memoo-mcp@latest` | Recommended — always latest, no global install |
| `npm i -g memoo-mcp` then `memoo-mcp` | Frequent local use |
| Clone + `make build` | Developing the server itself |

Check / update the CLI:

```bash
memoo-mcp --version          # or: memoo-mcp version
memoo-mcp update             # checks npm only — does not auto-install
memoo-mcp --help
```

If `update` reports a newer version:

```bash
npm i -g memoo-mcp@latest
# or keep using npx -y memoo-mcp@latest
```

---

## CLI

| Command | Purpose |
|---------|---------|
| `(default)` / `--stdio` | MCP over stdio (hosts) |
| `serve` / `--http` | Streamable HTTP at `http://127.0.0.1:8787/mcp` |
| `version` / `--version` / `-V` | Print package version |
| `update` | Compare local version to npm `latest` |
| `help` / `--help` / `-h` | Short usage |

### Flags / env

| Flag | Env | Description |
|------|-----|-------------|
| `--api-key` | `MEMOO_API_KEY` | Required for stdio (`moo_sk…`) |
| `--memo-namespace` | `MEMOO_NAMESPACE` | Required for stdio (UUID or name) |
| `--memoo-base-url` | `MEMOO_BASE_URL` | Default `https://memoo.hinha.web.id` |
| `--timeout` | `MEMOO_TIMEOUT` | Go-style duration (`600s`, `5m`) or ms |
| `--timeout-ms` | `MEMOO_TIMEOUT_MS` | Timeout in milliseconds |
| `--api-key-prefix` | `MEMOO_API_KEY_PREFIX` | Default `moo_sk` |

HTTP-only: `MEMOO_HOST` / `MEMOO_PORT` (default `127.0.0.1:8787`). Path is fixed at `/mcp`. Optional `MEMOO_ALLOWED_ORIGINS` (comma-separated) for CORS.

### Local from source

```bash
make install && make check && make build
make stdio ARGS='--memo-namespace <uuid|name> --timeout 600s'
# needs MEMOO_API_KEY in env or .env
```

Copy `.env.example` → `.env` for local development.

---

## Host compatibility

Primary transport is **stdio**. Same `command` + `args` + `env` pattern as other MCP servers.

| Host | Config | Notes |
|------|--------|-------|
| **Cursor** | `.cursor/mcp.json` or Settings → MCP | See `mcp.json.example` |
| **Claude Desktop** | `claude_desktop_config.json` | Same `mcpServers` JSON |
| **Claude Code** | MCP settings | Stdio; optional skill under `.claude/skills/` |
| **Codex** | MCP / tools config | Same flags |
| **OpenCode** | MCP `command`/`args`/`env` | Prefer stdio |

**Path-based local install** (instead of npx):

```json
{
  "mcpServers": {
    "memoo": {
      "command": "node",
      "args": [
        "/absolute/path/to/memoo-mcp/dist/index.js",
        "--memoo-base-url",
        "https://memoo.hinha.web.id",
        "--memo-namespace",
        "your-namespace",
        "--timeout",
        "600s"
      ],
      "env": {
        "MEMOO_API_KEY": "moo_sk_xxx"
      }
    }
  }
}
```

### Namespace resolution

`--memo-namespace` / `MEMOO_NAMESPACE` accepts a **UUID or name**.

On stdio boot the server calls `GET /api/v1/namespaces/{id}` (detail), resolves the canonical name, and uses that as the tool default. It does **not** list all namespaces for setup.

When a default is set, agents should omit `namespace` on tools and should not call `memoo_list_namespaces` unless you ask to switch or list other namespaces.

---

## Tools

| Tool | Purpose |
|------|---------|
| `search` / `fetch` | Host-compatible search / episode fetch |
| `memoo_list_namespaces` | List namespaces (discover / switch) |
| `memoo_list_episodes` | List episodes |
| `memoo_search` | Filtered knowledge search |
| `memoo_ask` | RAG Q&A |
| `memoo_graph_traverse` | Graph hops from `entity_uuid` |
| `memoo_temporal_query` | Point-in-time query |
| `memoo_create_episode` | Always async → `job_id` (summarize first) |
| `memoo_get_job_status` | Poll after every create until completed/failed |
| `memoo_delete_episode` | Delete episode |

## Resources

- `memoo://namespaces`
- `memoo://health`
- `memoo://episodes/{namespace}/{id}`
- `memoo://docs/workflow` / `memoo://docs/instructions`

## HTTP serve

```bash
npm run serve
# or: memoo-mcp serve
```

- MCP: `http://127.0.0.1:8787/mcp`
- Health: `GET /health`
- Auth: `Authorization: Bearer moo_sk…` (or process `MEMOO_API_KEY`)

---

## Skills

MCP tools and **skills** are separate. The skill teaches the agent *when/how* to explore; the server only registers tools.

Shipped skill: `skills/exploring-knowledge-graph/SKILL.md`  
Slash name: `/exploring-knowledge-graph`

Copy into your host skills directory (Claude / Cursor / `.agents/skills`), with Memoo MCP enabled. See the skill file for the exploration format.

---

## Developers

```bash
make check          # typecheck + biome + tests (coverage fail <75%, warn <90%)
make test-coverage
make release VERSION=1.0.1   # bump package.json, commit, create annotated tag v1.0.1
git push && git push origin v1.0.1   # triggers GitHub Actions → npm publish
```

**Coverage policy:** CI fails below **75%** (lines/statements/functions/branches). Below **90%** emits a warning annotation only.

**Release:** git tag `vX.Y.Z` is the source of truth. The release workflow syncs `package.json` version from the tag, runs checks, then `npm publish`. Requires repo secret `NPM_TOKEN`.

This package is the **canonical** Memoo MCP implementation. The Go gateway in the Memoo monorepo (`@hinha/memoo`) is deprecated for new installs.

### Docs

- [OPERATOR.md](docs/OPERATOR.md)
- [SECURITY.md](SECURITY.md)

## License

MIT
