# dsh-penpot-plugin

Penpot for [DeepSeek Harness](https://github.com/deepseek-ai): list, search,
inspect and export design files from a DSH agent, with an optional MCP backend
when one is already running.

`0.1` is deliberately read + export. Writing designs needs Penpot's
`update-file` change format; the design questions are in
[docs/DESIGN.md](docs/DESIGN.md).

## Install

```sh
dsh plugin --profile web add github:vladtsvirko/dsh-penpot-plugin
```

Restart the runtime after adding it. The plugin row reads its credentials from
the environment:

```sh
export PENPOT_API_URL='http://192.168.2.50:8090'   # no /api/rpc suffix needed
export PENPOT_ACCESS_TOKEN='...'                    # Penpot: Settings -> Access tokens
```

## Tools

| Tool | What it does |
|---|---|
| `penpot_status` | which backend is live (`api` or `mcp`) |
| `penpot_teams` | teams the account can see |
| `penpot_projects` | projects, optionally per team |
| `penpot_files` | files in a project |
| `penpot_search` | files by name or term |
| `penpot_file` | one file: id, name, pages |
| `penpot_export` | write a `.penpot` file to disk |

Export gives a zip of Penpot JSON: unzip it, read or edit with the normal file
tools, then import it back through the API (the `penpot` CLI in
[dsh-tg-docker-setup](https://github.com/vladtsvirko/dsh-tg-docker-setup) does the
import half today; a plugin tool is the obvious next step).

## Backends

- **api** — talks to Penpot's HTTP RPC with an access token. Always available
  with `PENPOT_API_URL` + `PENPOT_ACCESS_TOKEN`.
- **mcp** — delegates to an MCP server already registered in the runtime
  (`mcp__<server>__*`, as `@deepseek-ai/dsh-mcp-client` provides). Read-only:
  export and import are refused rather than faked.
- `backend: auto` (default) prefers MCP when its tools are registered, otherwise
  the API.

```yaml
- id: dsh-penpot
  config:
    apiUrl: http://192.168.2.50:8090
    token: !!js process.env.PENPOT_ACCESS_TOKEN ?? ''
    backend: auto
    mcpServer: penpot
```

## Compatibility

Plugin versions are independent of DSH and of the setup release. Each release
states the DSH range and the Penpot versions it was tested against in
[COMPATIBILITY.md](COMPATIBILITY.md).

## License

MIT.
