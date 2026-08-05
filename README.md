# memoo-mcp

TypeScript MCP server for [Memoo](https://github.com/hinha/memoo) — knowledge graph RAG over the Memoo REST API.

**Auth:** API key only (`moo_sk…`). No JWT. No OAuth.

This package is the **canonical** Memoo MCP implementation. The Go gateway in the Memoo monorepo (`api/cmd/mcp-gateway`, npm `@hinha/memoo`) is deprecated for new installs.

## Quick start

```bash
make install
make check          # typecheck + test
make build

# Stdio (Cursor / Claude / Codex) — recommended
make stdio ARGS='--memoo-base-url https://memoo.hinha.web.id --memo-namespace <uuid> --timeout 600s'

# Optional HTTP (Streamable HTTP, path fixed at /mcp)
make serve
# → http://127.0.0.1:8787/mcp
```

Or via npm:

```bash
npm install && npm run build
MEMOO_API_KEY=moo_sk_xxx npm run stdio -- \
  --memoo-base-url https://memoo.hinha.web.id \
  --memo-namespace 0b00322d-f6ed-45b7-a2e8-b7059f71de34 \
  --timeout 600s
```

Copy `.env.example` → `.env` for local development. See `make help` for all targets.

## Host compatibility (Cursor / Claude / Codex / OpenCode)

Primary transport is **stdio** via `@modelcontextprotocol/sdk` — the same shape as notion-bank-mcp and the deprecated Go gateway. All of these hosts work with `command` + `args` + `env`:

| Host | Config location | Notes |
|------|-----------------|-------|
| **Cursor** | `.cursor/mcp.json` or Settings → MCP | Use `mcp.json.example` |
| **Claude Desktop** | `claude_desktop_config.json` | Same `mcpServers` JSON |
| **Claude Code** | project/user MCP settings | Stdio; install skill under `.claude/skills/` if desired |
| **Codex** | MCP / tools config (stdio) | Same flags as Cursor |
| **OpenCode** | MCP server block (`command`/`args`/`env`) | Stdio recommended; HTTP `url` only if host supports Streamable HTTP |

**Compatible:** stdio + Zod tool schemas + `SERVER_INSTRUCTIONS` on initialize.  
**HTTP** (`make serve` → `/mcp`): optional; requires Bearer `moo_sk…`. Prefer stdio for local agents.

## Cursor / Claude / Codex / OpenCode config

Same flag shape as the legacy Go gateway. See `mcp.json.example`:

```json
{
  "mcpServers": {
    "memoo": {
      "command": "node",
      "args": [
        "/Users/hinha/Projects/hinha/memoo-mcp/dist/index.js",
        "--memoo-base-url",
        "https://memoo.hinha.web.id",
        "--memo-namespace",
        "0b00322d-f6ed-45b7-a2e8-b7059f71de34",
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

Or via env only (e.g. `npx` once published):

```json
{
  "mcpServers": {
    "memoo": {
      "command": "npx",
      "args": ["-y", "memoo-mcp@latest"],
      "env": {
        "MEMOO_API_KEY": "moo_sk_xxx",
        "MEMOO_NAMESPACE": "0b00322d-f6ed-45b7-a2e8-b7059f71de34",
        "MEMOO_BASE_URL": "https://memoo.hinha.web.id",
        "MEMOO_TIMEOUT": "600s"
      }
    }
  }
}
```

### Namespace resolution

`--memo-namespace` / `MEMOO_NAMESPACE` accepts a **UUID or name**.

On stdio boot the server calls `GET /api/v1/namespaces/{id}` (**detail**), resolves the canonical name, and uses that as the tool default. It does **not** call list-namespaces for setup.

When a default is configured, agents should omit `namespace` on tools and should not call `memoo_list_namespaces` unless the user asks to switch/list other namespaces.

## CLI flags

| Flag | Env | Description |
|------|-----|-------------|
| `--api-key` | `MEMOO_API_KEY` | Required for stdio (`moo_sk…`) |
| `--memo-namespace` | `MEMOO_NAMESPACE` | Required for stdio (UUID or name) |
| `--memoo-base-url` | `MEMOO_BASE_URL` | Default `https://memoo.hinha.web.id` |
| `--timeout` | `MEMOO_TIMEOUT` | Go-style duration (`600s`, `5m`) or ms |
| `--timeout-ms` | `MEMOO_TIMEOUT_MS` | Timeout in milliseconds |
| `--api-key-prefix` | `MEMOO_API_KEY_PREFIX` | Default `moo_sk` |

HTTP-only: `MEMOO_HOST` / `MEMOO_PORT` (default `127.0.0.1:8787`). MCP HTTP path is **fixed** at `/mcp` (not configurable). Optional `MEMOO_ALLOWED_ORIGINS` for CORS Origin allowlist.

## Tools

| Tool | Purpose |
|------|---------|
| `search` / `fetch` | Host compatibility search / episode fetch |
| `memoo_list_namespaces` | List namespaces (only when discovering / switching) |
| `memoo_list_episodes` | List episodes |
| `memoo_search` | Filtered knowledge search |
| `memoo_ask` | RAG Q&A |
| `memoo_graph_traverse` | Graph hops from `entity_uuid` |
| `memoo_temporal_query` | Point-in-time query |
| `memoo_create_episode` | Async ingest → `job_id` (summarize first; word max = API plan `episode_content_words`) |
| `memoo_get_job_status` | Poll ingest job |
| `memoo_delete_episode` | Delete episode |

## Resources

- `memoo://namespaces`
- `memoo://health`
- `memoo://episodes/{namespace}/{id}`

## HTTP serve

```bash
npm run serve
```

- MCP endpoint: `http://127.0.0.1:8787/mcp` (fixed path)
- Health: `GET /health`
- Auth: `Authorization: Bearer moo_sk…` (or process env `MEMOO_API_KEY`)

## Skills

MCP tools and **skills** are separate:

| Piece | What it does |
|-------|----------------|
| **memoo-mcp** (MCP server) | Registers tools (`memoo_search`, `memoo_ask`, …) the agent can call |
| **Skill** (`SKILL.md`) | Playbook that teaches the agent *when/how* to explore a Memoo namespace |

The MCP protocol does **not** install skills. You copy the skill folder into your agent’s skills directory (or point the host at it).

Shipped skill:

```
skills/exploring-knowledge-graph/SKILL.md
```

Name / slash command: `exploring-knowledge-graph` → often invoked as `/exploring-knowledge-graph`.

### Prerequisites

1. Install and enable **memoo-mcp** (stdio config above) with a valid `MEMOO_API_KEY` and `--memo-namespace` / `MEMOO_NAMESPACE`.
2. Restart or reload the MCP server in the host after changing MCP config.

### Install the skill

From a clone of this repo (`REPO` = absolute path to `memoo-mcp`):

**Claude Code**

```bash
# Personal (all projects)
mkdir -p ~/.claude/skills
cp -R "$REPO/skills/exploring-knowledge-graph" ~/.claude/skills/

# Or project-only (commit with the app repo)
mkdir -p .claude/skills
cp -R "$REPO/skills/exploring-knowledge-graph" .claude/skills/
```

**Cursor**

```bash
# Personal
mkdir -p ~/.cursor/skills
cp -R "$REPO/skills/exploring-knowledge-graph" ~/.cursor/skills/

# Or project-only
mkdir -p .cursor/skills
cp -R "$REPO/skills/exploring-knowledge-graph" .cursor/skills/
```

**Codex / OpenCode / multi-agent**

Many hosts also honor a shared layout:

```bash
mkdir -p .agents/skills
cp -R "$REPO/skills/exploring-knowledge-graph" .agents/skills/
```

Check your host docs if it uses a different path. Structure must stay:

```text
…/skills/exploring-knowledge-graph/SKILL.md
```

Symlink instead of copy (keeps the skill in sync with this repo):

```bash
ln -s "$REPO/skills/exploring-knowledge-graph" ~/.claude/skills/exploring-knowledge-graph
```

### How to use

1. Confirm Memoo MCP tools are available in the host (e.g. `memoo_search`, `memoo_ask`).
2. **Automatic:** ask something that matches the skill description, for example:
   - “Explore how auth evolved in this Memoo namespace”
   - “Trace dependencies around payment in the knowledge graph”
3. **Explicit (Claude Code and hosts with slash skills):**
   ```text
   /exploring-knowledge-graph
   ```
   Then add your topic, e.g. `/exploring-knowledge-graph authentication architecture`.
4. The agent should:
   - Use the configured default namespace (skip `memoo_list_namespaces` unless you ask to switch)
   - Call Memoo tools (`memoo_search` → `memoo_graph_traverse` → `memoo_list_episodes` / `fetch` → `memoo_ask`)
   - Answer in the skill’s exploration format (entities, relationships, timeline, insights)

### Update / remove

```bash
# Update after pulling memoo-mcp
cp -R "$REPO/skills/exploring-knowledge-graph" ~/.claude/skills/

# Remove
rm -rf ~/.claude/skills/exploring-knowledge-graph
```

## Docs

- [OPERATOR.md](docs/OPERATOR.md)
- [SECURITY.md](SECURITY.md)

## License

MIT
