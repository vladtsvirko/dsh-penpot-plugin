# Changelog

## 0.3.1

- **Reads ask for JSON.** Penpot answers transit unless the request sends
  `Accept: application/json`; without it every list came back as transit and
  parsed into empty refs (`penpot_teams` showed `{"id":"","name":""}`). Every
  RPC request now sends the header.
- **`penpot_export` reads Penpot's real response.** `export-binfile` is an SSE
  stream that ends with the URL of the exported zip; the plugin treated the
  stream itself as the file and wrote `event: progress` text as a `.penpot`.
  It now parses the stream, downloads the URL and returns the zip bytes.
- **`penpot_import` reads Penpot's real response.** `import-binfile` is also
  SSE and ends with the id(s) of the imported file(s); the plugin called
  `.json()` and failed after a successful import. It now parses the stream and
  returns the file id.
- **`penpot_search` sends the team.** Penpot's `search-files` requires a
  `team-id`; the tool takes an optional `teamId` and otherwise searches the
  first team the account can see.
- SSE event data is transit-encoded (`~:` keys, `~u` uuids); a small normalizer
  handles both markers so errors and ids are readable without a transit
  dependency.

## 0.3.0

- **npm distribution.** The package is published as
  `dsh-penpot-plugin@<version>`; the registry tarball contains `lib/`, so
  installs no longer run a build script. The release workflow publishes a tag
  with provenance. The setup pins this npm spec and keeps the GitHub tag as a
  fallback.
- **`penpot_import`.** The export counterpart is now a tool: upload a `.penpot`
  file as a new file (`projectId`) or replace an existing one (`fileId`). The
  backend already had the multipart `import-binfile` call; the setup CLI was the
  only caller.
- **Bundle patch corrected.** `cordis.patch.yml` still passed `backend: auto`
  and `mcpServer`, which 0.2.0 removed. The row now declares only `apiUrl` and
  `token`, so a standalone install no longer starts with a stale config key.
- **Builds clean before packaging.** `lib/` is removed before every build, so
  compiled files from removed modules (the old MCP backend) can never enter a
  tarball.
- **The package description no longer claims an MCP backend.** It was stale
  since 0.2.0 and is the text GitHub and npm show.
- **Standalone is documented as a first-class path** (`docs/STANDALONE.md`): no
  setup, no managed row, same tools. The setup remains the convenience wrapper,
  not a requirement.
- **Load fix.** The plugin used `ctx.tools` without declaring
  `inject = ['tools']`; Cordis refuses that property, so a standalone profile
  failed at load with `cannot get property "tools" without inject`. The setup
  masked it only while the plugin happened not to be mounted. Declared now.
- Tool-surface tests cover the service declaration, the always-registered set,
  the unconfigured status, and the import destination check.

## 0.2.0

- **MCP backend removed.** The plugin talks to Penpot's local HTTP RPC only.
  `backend`, `mcpServer` and the `mcp__<server>__*` adapter are gone; the
  read-only MCP path could not export and could silently replace the API via
  `auto`.
- The plugin now loads even when `PENPOT_API_URL`/`PENPOT_ACCESS_TOKEN` are
  empty: `penpot_status` reports `none`, the other tools throw one readable
  configuration error.
- README/DESIGN updated for the systemd/Podman setup (`--design penpot`).

## 0.1.2

Docs only. The setup path now says `/system components` (the command was renamed
from `/system manage`).

## 0.1.1

- Docs only. The install section now leads with the DSH setup's design
  component (`install.sh --design docker` / `/system manage`), pins the manual
  install at a tag, and explains the pnpm `allowBuilds` gate that otherwise
  aborts a git install. Credentials are described as the runtime process's
  environment, not a shell export.
- `COMPATIBILITY.md` records that the setup pins this plugin and the Penpot
  images, so a ref or image bump is a setup release.

## 0.1.0

- First cut: `penpot_status`, `penpot_teams`, `penpot_projects`,
  `penpot_files`, `penpot_search`, `penpot_file`, `penpot_export`.
- Two backends behind one interface: the HTTP API with an access token, and an
  MCP server already registered in the runtime. `auto` prefers MCP read tools.
- Export writes a `.penpot` file; import is not exposed as a tool yet.
