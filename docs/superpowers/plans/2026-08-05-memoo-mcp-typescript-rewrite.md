# Memoo MCP TypeScript Rewrite

> Execution plan (saved from Cursor). Source of truth for the TS package is this repo.

## Goal / context

Ship a standalone TypeScript MCP package that fully replaces the Go gateway’s tool/resource surface, follows `notion-bank-mcp` project shape, and ships an English skill for exploring Memoo knowledge graphs via Memoo MCP tools (not Graphiti).

## Scope

**In:** Full tool/resource parity; stdio + Streamable HTTP; API key auth; skill rewrite; monorepo deprecation banners; Notion sync under Memoo.

**Out:** Deleting Go gateway; npm publish; changing Memoo REST contracts.

## Approach

1. Scaffold (package.json, tsconfig, config/runtime/index)
2. Memoo REST client + mocked fetch tests
3. Register tools/resources
4. HTTP serve (Bearer, localhost defaults)
5. Skill + README/SECURITY/OPERATOR
6. Soft-deprecate Go docs in Memoo monorepo
7. Upsert this plan to Notion (service Memoo)

## Architecture

Thin MCP server (`@modelcontextprotocol/sdk` + Zod) over typed Memoo REST client (`moo_sk` Bearer). Default base URL `https://memoo.hinha.web.id`.

## Tools / resources

`search`, `fetch`, `memoo_list_namespaces`, `memoo_list_episodes`, `memoo_search`, `memoo_ask`, `memoo_graph_traverse`, `memoo_temporal_query`, `memoo_create_episode`, `memoo_get_job_status`, `memoo_delete_episode`.

Resources: `memoo://namespaces`, `memoo://health`, `memoo://episodes/{namespace}/{id}`.

## Status

`done` (implementation complete in memoo-mcp).
