# Design

## Shape

```
tools (defineTool)  ──►  PenpotBackend  ──►  api: Penpot RPC + access token
                              │
                              ├── design.ts: pure outline/token/audit analysis
                              └── skill.ts: the bundled Penpot skill provider
```

One backend, one set of model-facing names. There is no MCP path: the plugin
talks to a Penpot instance over its HTTP RPC.

## Backend

`POST /api/rpc/command/<name>` with `Authorization: Token …`, kebab-case
payloads.

- Discovery: `get-teams`, `get-projects`/`get-all-projects`,
  `get-project-files`, `search-files`, `get-file-summary`.
- Read: `get-file`, `get-page`, `get-comment-threads`, `get-comments`,
  `get-file-snapshots`, `get-file-libraries`, `get-builtin-templates`.
- Write: `create-project`, `create-file`, `duplicate-file`, `clone-template`,
  `create-file-snapshot`, `export-binfile`, `import-binfile`.
- `export-binfile`, `import-binfile` and `clone-template` answer as SSE streams;
  the export stream ends with a download URL, the import and clone streams with
  the new id(s). Transit markers `~u`, `~:` and `~#` are normalized in
  `api-backend.ts`; `clone-template` may wrap ids in `{~#set: […]}`.
- `design.ts` never performs I/O. It walks `data.pagesIndex`, extracts text,
  reads the DTCG token library, resolves aliases, formats outlines and runs the
  contrast/typography audit. That keeps it testable with a fixture and reusable
  if the transport changes.
- `shapes.ts` builds the minimal valid Penpot shape maps for frames, rectangles,
  circles and text, plus the rich-text/`positionData` layout. The tools apply
  them through one `update-file` change per call.
- `skill.ts` registers `skills/penpot/` on `ctx.skills`; the skill is part of the
  npm package and needs no profile entry.
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

1. **Text metrics.** The writer lays out explicit newlines but does not measure
   wrapping. A wrapped line can overflow its box; a future version should either
   request line breaks from the caller or measure with a font-aware layout.
2. **Advanced primitives.** Groups, booleans, paths, images and component
   instances still require the raw `update-file` format. Add them only with a
   schema/template and a fixture.
3. **Components and prototype flows.** `get-file` carries them, but the 2.18.6
   test files did not exercise the schema; add only after a component-heavy
   fixture exists.
4. **Resources.** A file could be exposed as a DSH resource rather than fetched
   through a tool; depends on what DSH's resource surface wants.

## Non-goals

- The live canvas. That is the browser plugin API, reachable only through a
  human tab, not a headless plugin.
- Owning Penpot's data model. Everything goes through the API; no direct
  Postgres reads.
