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

### Standalone (any DSH runtime)

See [docs/STANDALONE.md](docs/STANDALONE.md) for the complete walkthrough.

The plugin is a normal DSH bundle: it works in any profile, with or without the
setup. It needs a Penpot instance and an access token, nothing else from this
project. It is published to npm as an exact version:

```sh
dsh plugin --profile web add dsh-penpot-plugin@0.3.0
```

The registry tarball contains the built `lib/`, so there is no `prepare` build
and no `allowBuilds` entry. Restart the runtime after adding it.

From the source repository instead, allow the build and pin the tag:

```yaml
allowBuilds:
  dsh-penpot-plugin@https://github.com/vladtsvirko/dsh-penpot-plugin.git: true
```

```sh
dsh plugin --profile web add github:vladtsvirko/dsh-penpot-plugin#v0.3.0
```
 The row reads its credentials from the
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
| `penpot_import` | upload a `.penpot` file as a new or replacement file |

Export gives a zip of Penpot JSON: unzip it, read or edit with the normal file
tools, then import it back with `penpot_import` — no setup CLI and no second
toolchain. A new file needs `projectId`; replacing one needs `fileId`.

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

## Updating

Plugin versions are independent of DSH and of the setup release.

- **In the setup:** `/system update penpot` in the bot (or `/system update
  plugin dsh-penpot-plugin`) resolves the newest version, opens a rollback trial,
  and replaces the bundle through the host's plugin manager.
- **Standalone:** `dsh plugin --profile <name> remove dsh-penpot-plugin`, then
  `add` the new tag. The plugin manager cannot install over an already-installed
  git package, so it is two steps; restart the runtime when it reports
  `restart-required`.

The `dsh-penpot` row's configuration is preserved across an update; only the
package moves.

## Compatibility

Plugin versions are independent of DSH and of the setup release. Each release
states the DSH range and the Penpot versions it was tested against in
[COMPATIBILITY.md](COMPATIBILITY.md). The setup pins an exact npm spec in
`plugins.json`; a newer compatible version installed from the bot stays
installed across reboots, and the GitHub tag of the same release is the
registry-unreachable fallback.
