# dsh-penpot-plugin

Penpot for [DeepSeek Harness](https://github.com/deepseek-ai): list, search,
inspect, export and import design files from a DSH agent over Penpot's HTTP RPC
API.

The plugin is a normal DSH bundle. It talks to a Penpot instance you run
(2.18.6 is the tested version) and needs an API origin and an access token;
nothing else.

The tool surface is deliberately read + export + import. Writing designs
through Penpot's `update-file` change format is the open design question; see
[docs/DESIGN.md](docs/DESIGN.md).

## Install

The plugin is published to npm as an exact version:

```sh
dsh plugin --profile <profile> add dsh-penpot-plugin@0.4.5
```

The registry tarball contains the built `lib/`, so there is no `prepare` build
and no `allowBuilds` entry. Restart the runtime when the manager reports
`restart-required`.

From the source repository instead, allow the build and pin the tag:

```yaml
allowBuilds:
  dsh-penpot-plugin@https://github.com/vladtsvirko/dsh-penpot-plugin.git: true
```

```sh
dsh plugin --profile <profile> add github:vladtsvirko/dsh-penpot-plugin#v0.4.5
```

The package is a plugin bundle: `cordis.patch.yml` mounts one `dsh-penpot` row.

## Configure

On DSH `0.2.1-rc.5` or newer, open **Plugins** → **dsh-penpot-plugin** and press
**Configure** on the `dsh-penpot` row. Set:

- **API URL** — the Penpot origin, for example `http://yourpenpot.url`
  (include the port if your instance uses one; no `/api/rpc` suffix;
  `https://…:8443` works when the CA is trusted).
- **Access token** — create it in Penpot → Settings → Access tokens.

**Save** writes the row's config into the profile's user layer; the URL and
token take effect on the next tool call.

Without the UI (an older DSH or a headless profile), the row reads the runtime
process environment:

```sh
export PENPOT_API_URL='http://yourpenpot.url'      # no /api/rpc suffix needed
export PENPOT_ACCESS_TOKEN='...'                   # Penpot: Settings -> Access tokens
```

The row's `config` also accepts the two values directly:

```yaml
- id: dsh-penpot
  config:
    apiUrl: http://yourpenpot.url
    token: !!js process.env.PENPOT_ACCESS_TOKEN ?? ''
```

The UI values override the environment. Ask the agent for `penpot_status`: it
names the endpoint, and a missing value is reported by name.

## Tools

| Tool | What it does |
|---|---|
| `penpot_status` | whether the API is configured, and its endpoint |
| `penpot_teams` | teams the account can see |
| `penpot_projects` | projects, optionally per team |
| `penpot_files` | files in a project |
| `penpot_search` | files by name or term |
| `penpot_file` | one file: id and name |
| `penpot_export` | write a `.penpot` file to disk |
| `penpot_import` | upload a `.penpot` file as a new or replacement file |

Export gives a zip of Penpot JSON: unzip it, read or edit with the normal file
tools, then import it back with `penpot_import` — no extra CLI and no second
toolchain. A new file needs `projectId`; replacing one needs `fileId`.

## Backend

One backend: Penpot's HTTP RPC.

- `POST /api/rpc/command/<name>` with `Authorization: Token …`, kebab-case
  payloads (`get-teams`, `get-all-projects`/`get-projects`,
  `get-project-files`, `search-files`, `get-file-summary`, `export-binfile`,
  `import-binfile`).
- Configuration is `apiUrl` + `token`. If either is empty the plugin still
  loads, and `penpot_status` says `none` while the other tools explain what to
  set.

## Updating

Plugin versions are independent of DSH.

- From the **Plugins** page, update the bundle.
- Or `dsh plugin --profile <name> remove dsh-penpot-plugin`, then add the new
  version. The plugin manager cannot install over an already-installed git
  package, so it is two steps; restart the runtime when it reports
  `restart-required`.

The `dsh-penpot` row's configuration is preserved across an update; only the
package moves.

## Compatibility

Plugin versions are independent of DSH. Each release states the DSH range and
the Penpot versions it was tested against in
[COMPATIBILITY.md](COMPATIBILITY.md). A newer compatible version installed from
the Plugins page stays installed across reboots.
