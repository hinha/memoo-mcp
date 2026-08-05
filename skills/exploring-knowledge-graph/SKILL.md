---
name: exploring-knowledge-graph
description: Deep exploration of Memoo knowledge graphs via Memoo MCP. Use when investigating connections, tracing decisions, or understanding architectural evolution in a Memoo namespace.
allowed-tools: search, fetch, memoo_list_namespaces, memoo_list_episodes, memoo_search, memoo_ask, memoo_graph_traverse, memoo_temporal_query, memoo_create_episode, memoo_get_job_status, memoo_delete_episode
metadata:
  mcpmarket-version: 1.0.0
---
# Exploring the Knowledge Graph

Explore Memoo namespaces through **Memoo MCP** tools (Memoo REST API only).

## When to Use

**Deep graph exploration:**
- Tracing how a decision evolved over time
- Understanding connections between components
- Finding related architectural patterns
- Investigating why something was built a certain way

## Namespace context

Prefer a session default (UUID or name — gateway resolves via `GET /api/v1/namespaces/{id}` detail at boot):

```bash
export MEMOO_NAMESPACE="0b00322d-f6ed-45b7-a2e8-b7059f71de34"
# or MCP args: --memo-namespace <uuid|name>
```

If a default is already configured, **omit** `namespace` on tool calls and **skip** `memoo_list_namespaces` unless the user asks to switch/list other namespaces.

## Exploration Strategy

**Step 1: Find starting point**

```text
memoo_search / search:
  query: "authentication architecture"
  limit: 5
```

**Step 2: Explore relationships**

Use entity UUIDs from search hits:

```text
memoo_graph_traverse:
  entity_uuid: "<uuid from search>"
  max_hops: 2
```

Optionally ask for a synthesized view:

```text
memoo_ask:
  query: "What depends on authentication and how?"
  use_reranker: true
```

**Step 3: Get episode context**

```text
memoo_list_episodes:
  page: 1
  page_size: 20

fetch:
  id: "<episode_id>"
```

For a point-in-time slice:

```text
memoo_temporal_query:
  query: "authentication"
  at_time: <unix_timestamp>
  limit: 10
```

## Ingest (when asked to store knowledge)

1. Summarize first (prefer ≤300 words). Hard max is plan entitlement `episode_content_words` (API-enforced; not a fixed 900).
2. `memoo_create_episode` → often returns `job_id`
3. Poll `memoo_get_job_status` until `completed` / `failed`
4. On HTTP 413 / content too long → summarize further and retry

## Exploration Patterns

**Pattern 1: Trace a decision's evolution**

1. `memoo_search` for the concept
2. `memoo_graph_traverse` from central entities
3. `memoo_list_episodes` / `fetch` chronologically
4. Identify what changed and why

**Pattern 2: Understand component dependencies**

1. Search for the component name
2. Traverse graph edges (`memoo_graph_traverse`)
3. Map the dependency neighborhood
4. Identify potential issues

**Pattern 3: Find reusable patterns**

1. Broad `memoo_search` (e.g. "API design patterns")
2. Group entities by similarity
3. Use `memoo_ask` to synthesize a reusable approach

## Response Format

Present findings as:

```markdown
## Exploration: [Topic]

### Central Entities
- Entity 1: Description
- Entity 2: Description

### Key Relationships
- Entity A → Entity B: Relationship type
- Entity B → Entity C: Relationship type

### Evolution Timeline
- [Date]: Initial decision
- [Date]: Refinement
- [Date]: Current state

### Insights
- Pattern discovered
- Dependency identified
- Trade-off understood
```

## Anti-Patterns

- Exploring without a clear starting query
- Looking only at search hits without graph traversal
- Ignoring temporal / episode chronology
- Not synthesizing findings into actionable insights
- Calling `memoo_list_namespaces` when `--memo-namespace` / `MEMOO_NAMESPACE` is already set
- Ingesting raw transcripts without summarizing
