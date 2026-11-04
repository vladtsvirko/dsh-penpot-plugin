# dsh-penpot-plugin

Penpot for [DeepSeek Harness](https://github.com/deepseek-ai): list, search,
inspect and export design files from a DSH agent, with an optional MCP backend
when one is already running.

`0.1` is deliberately read + export. Writing designs needs Penpot's
`update-file` change format; the design questions are in
[docs/DESIGN.md](docs/DESIGN.md).

## Install

### In the DSH setup (recommended)

The setup's optional design component installs Penpot, the `penpot` CLI and this
plugin together, with the plugin ref pinned in `components.json`:

```sh
./install.sh --design docker       # or add it later: /system manage -> Enable
```

That path is self-contained: it writes `PENPOT_API_URL` and
`PENPOT_ACCESS_TOKEN` into the runtime environment, installs the pinned plugin
and mounts a managed `dsh-penpot` row. Nothing below is needed.

### Into any other runtime

Pin a tag and allow the package's build, or pnpm ≥ 10 refuses to run `prepare`
and the install aborts before any code exists. pnpm prints the exact
`allowBuilds` key; add it to the profile's `pnpm-workspace.yaml` and retry:

```yaml
allowBuilds:
  dsh-penpot-plugin@https://github.com/vladtsvirko/dsh-penpot-plugin.git: true
```

```sh
dsh plugin --profile web add github:vladtsvirko/dsh-penpot-plugin#v0.1.0
```

Restart the runtime after adding it. The row reads its credentials from the
environment of the **runtime process** — exporting them in a shell later does
not reach a running runtime:

```sh
export PENPOT_API_URL='http://192.168.2.50:8090'   # no /api/rpc suffix needed
export PENPOT_ACCESS_TOKEN='...'                    # Penpot: Settings -> Access tokens
```

In the Docker setup that means adding both to `.env` and recreating the
container (`docker compose up -d dsh`); the design component does it for you.
Ask the agent for `penpot_status` to verify: it names the live backend and
endpoint, and a missing variable is reported by name.

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
