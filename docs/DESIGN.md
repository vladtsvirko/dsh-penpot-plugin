# Design

## Shape

```
tools (defineTool)  ──►  PenpotBackend  ──►  api: Penpot RPC + access token
```

One backend, one set of model-facing names. There is no MCP path: the plugin
runs beside a local Penpot instance and uses its HTTP RPC, which is the same
surface the `penpot` CLI uses.

## Backend

`POST /api/rpc/command/<name>` with `Authorization: Token …`, kebab-case
payloads. Ported from the `penpot` CLI in the setup repo.

- `get-teams`, `get-all-projects`/`get-projects`, `get-files`,
  `search-files`, `get-file-summary`, `export-binfile`, `import-binfile`.
- A missing `PENPOT_API_URL` or `PENPOT_ACCESS_TOKEN` leaves the plugin loaded
  but unconfigured: `penpot_status` reports `none`, every other tool throws the
  same readable error instead of failing the whole plugin at load.

## Why no MCP

MCP was an optional second transport in 0.1. It delegated to tools registered by
`@deepseek-ai/dsh-mcp-client`, so it needed a separate MCP server, exposed only
read operations, and refused export/import. With the direct API available, it
added a configuration footgun (`backend: auto` would pick the read-only MCP and
break `penpot_export`) and no capability. Removed in 0.2.0.

The hosted `penpot.app` MCP is a remote service for Penpot's cloud account; it is
not used by this local setup, and routing designs through it would leave the
host.

## Open questions (v0.2+)

1. **Writes.** Penpot's `update-file` takes a `changes` array (`add-obj`,
   `mod-obj`, `del-obj`) against its shape model. The pragmatic path is
   shape-by-shape: text first, then fill, then geometry, each with a Penpot
   version row in the matrix.
2. **Import.** The `penpot_export` counterpart. The multipart shape is known
   (see the setup CLI) and unverified against a real instance.
3. **Resources.** A file could be exposed as a DSH resource rather than fetched
   through a tool; depends on what DSH's resource surface wants.

## Non-goals

- The live canvas. That is the browser plugin API, reachable only through a
  human tab, not a headless plugin.
- Owning Penpot's data model. Everything goes through the API; no direct
  Postgres reads.
