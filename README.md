# dsh-penpot-plugin

Penpot for [DeepSeek Harness](https://github.com/deepseek-ai): list, search,
inspect and export design files from a DSH agent over Penpot's local HTTP API.

`0.2` is deliberately read + export. Writing designs needs Penpot's
`update-file` change format; the design questions are in
[docs/DESIGN.md](docs/DESIGN.md).

There is no MCP backend. The setup runs a local Penpot instance and talks to it
over `/api/rpc/command/*` with an access token; a second transport added a
read-only path that could not export, so it was removed in 0.2.0.

## Install

### In the DSH setup (recommended)

The setup's optional design component installs Penpot, the `penpot` CLI and this
plugin together, with the plugin ref pinned in `components.json`:

```sh
./install.sh --design penpot       # or add it later: /system components -> Enable
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
dsh plugin --profile web add github:vladtsvirko/dsh-penpot-plugin#v0.2.0
```

Restart the runtime after adding it. The row reads its credentials from the
environment of the **runtime process** — exporting them in a shell later does
not reach a running runtime:

```sh
export PENPOT_API_URL='http://192.168.2.50:8090'   # no /api/rpc suffix needed
export PENPOT_ACCESS_TOKEN='...'                    # Penpot: Settings -> Access tokens
```

In the DSH setup that means adding both to `.env` and restarting
`dsh.service`; the design component does it for you. Ask the agent for
`penpot_status` to verify: it names the endpoint, and a missing variable is
reported by name.

## Tools

| Tool | What it does |
|---|---|
| `penpot_status` | whether the API is configured, and its endpoint |
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

## Backend

One backend: Penpot's HTTP RPC.

- `POST /api/rpc/command/<name>` with `Authorization: Token …`, kebab-case
  payloads (`get-teams`, `get-all-projects`, `get-files`, `search-files`,
  `get-file-summary`, `export-binfile`, `import-binfile`).
- Configuration is `apiUrl` + `token`; both come from the environment in the
  setup's managed row. If either is empty the plugin still loads, and
  `penpot_status` says `none` while the other tools explain what to set.

```yaml
- id: dsh-penpot
  config:
    apiUrl: http://192.168.2.50:8090
    token: !!js process.env.PENPOT_ACCESS_TOKEN ?? ''
```

## Compatibility

Plugin versions are independent of DSH and of the setup release. Each release
states the DSH range and the Penpot versions it was tested against in
[COMPATIBILITY.md](COMPATIBILITY.md).
