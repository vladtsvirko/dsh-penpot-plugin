# Design

## Shape

```
tools (defineTool)  ──►  PenpotBackend  ──►  api: Penpot RPC + access token
```

One backend, one set of model-facing names. There is no MCP path: the plugin
talks to a Penpot instance over its HTTP RPC.

## Backend

`POST /api/rpc/command/<name>` with `Authorization: Token …`, kebab-case
payloads.

- `get-teams`, `get-all-projects`/`get-projects`, `get-project-files`,
  `search-files`, `get-file-summary`, `export-binfile`, `import-binfile`.
- `export-binfile` and `import-binfile` answer as SSE streams; the export stream
  ends with a download URL and the import stream with the id of the new file.
- A missing API URL or token (from the Plugins page or the
  `PENPOT_API_URL`/`PENPOT_ACCESS_TOKEN` environment) leaves the plugin loaded
  but unconfigured: `penpot_status` reports `none`, every other tool throws the
  same readable error instead of failing the whole plugin at load.

## Why no MCP

The plugin uses Penpot's HTTP RPC directly. An MCP transport was tried in the
first iteration, but it exposed only read tools and could not export or import,
so it added configuration without capability. The hosted `penpot.app` MCP is a
remote service for Penpot's cloud account; routing designs through it would
leave the host.

## Open questions

1. **Writes.** Penpot's `update-file` takes a `changes` array (`add-obj`,
   `mod-obj`, `del-obj`) against its shape model. The pragmatic path is
   shape-by-shape: text first, then fill, then geometry, each with a Penpot
   version row in the matrix.
2. **Resources.** A file could be exposed as a DSH resource rather than fetched
   through a tool; depends on what DSH's resource surface wants.

## Non-goals

- The live canvas. That is the browser plugin API, reachable only through a
  human tab, not a headless plugin.
- Owning Penpot's data model. Everything goes through the API; no direct
  Postgres reads.
