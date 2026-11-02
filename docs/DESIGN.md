# Design

## Shape

```
tools (defineTool)  ──►  PenpotBackend  ──┬─► api: Penpot RPC + access token
                                          └─► mcp: mcp__<server>__* tools
```

The tool surface is fixed; the backend is chosen once at plugin load. That keeps
two very different transports behind one set of model-facing names, and lets a
deployment switch without relearning the tools.

`select.ts` is pure: config plus the tool registry in, a backend or a readable
error out. It is the part that is fully tested here.

## Backends

- **api** — `POST /api/rpc/command/<name>` with `Authorization: Token …`,
  kebab-case payloads. Ported from the `penpot` CLI in the setup repo.
- **mcp** — delegates to tools that `@deepseek-ai/dsh-mcp-client` registered.
  Some servers expose export, most do not; unsupported operations throw
  `UnsupportedOperation` rather than returning a plausible lie.

## Open questions (v0.2+)

1. **MCP invocation shape.** `ctx.tools.execute()` expects a call id, a name and
   arguments, and some modes add a schema and a caller agent. The adapter in
   `src/index.ts` is the minimum; it needs verifying against a real MCP tool set
   before MCP is trusted beyond reads.
2. **Tool-name mapping.** Servers differ. Options: a config map, an
   introspection probe at load, or a small adapter per server (official Penpot
   MCP vs community ones).
3. **Writes.** Penpot's `update-file` takes a `changes` array (`add-obj`,
   `mod-obj`, `del-obj`) against its shape model. The pragmatic path is
   shape-by-shape: text first, then fill, then geometry, each with a Penpot
   version row in the matrix.
4. **Import.** The `penpot_export` counterpart. The multipart shape is known
   (see the setup CLI) and unverified against a real instance.
5. **Resources.** A file could be exposed as an MCP-style resource rather than
   fetched through a tool; depends on what DSH's resource surface wants.

## Non-goals

- The live canvas. That is the browser plugin API, reachable only through the
  official MCP's browser bridge — a human tab, not a headless plugin.
- Owning Penpot's data model. Everything goes through the API; no direct
  Postgres reads.
