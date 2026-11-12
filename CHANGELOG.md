# Changelog

## 0.4.6

- **Export understands Penpot 2.18's end event.** `export-binfile` ends with
  `{"~#uri": "…"}`; the transit normalizer only knew `~:` and `~u`, so
  `penpot_export` reported that the stream had no download URL. It now decodes
  `~#` keys and values and accepts the `uri` field, as well as the old plain
  string form.
- **Same-origin export downloads send the token.** Penpot serves the export
  from `/assets/by-id/…`, which requires the access token. A presigned URL on
  another origin still receives no token.
- **The Save button stays visible in both themes.** It now uses the theme's
  surface and primary label colors instead of white text on the brand fill,
  which could disappear.
- Note: the export URL is only downloadable when the Penpot public origin
  proxies `/assets/by-id/` to the backend. The deployment used for this release
  returns an nginx 404 for that path; that is a proxy configuration gap, not
  the plugin.

## 0.4.5

- **The row config form follows the DSH UI.** It now uses the current
  `--dsw-alias-*` theme tokens and standard input/button sizing instead of the
  old `--dsh-*` fallbacks, so it reads as part of the Plugins page in both
  themes.
- **Saved state is explicit.** A status panel says whether the API URL and
  access token are set, names the missing one, and notes that changes save to
  the profile and apply immediately. The token stays masked.
- The API URL hint is now `http://yourpenpot.url` instead of a real-looking
  localhost value; the field still accepts a port and no `/api/rpc` suffix.
- Saving an incomplete pair reports that both values are needed to enable the
  tools.

## 0.4.4

- **The row config page now shows the form.** DSH's settings surface only
  projects volatile Config fields. `apiUrl` and `token` were ordinary fields,
  so the `dsh-penpot` settings namespace never appeared, the page passed no
  form, and the row page reported that the plugin had no configuration. Both
  fields are volatile now.
- **Values apply without a restart.** Every tool call resolves the backend from
  the current URL and token, so saving on the Plugins page takes effect
  immediately.
- The unconfigured error now points at the Plugins page first, with the
  environment variables as the fallback.
- While the form is loading, the page says so instead of claiming the plugin
  exposes no configuration.
- Host tool behavior and the Penpot RPC calls are unchanged.

## 0.4.3

- **The published package could not load its host row.** The plugin imports
  `@deepseek-ai/schemastery` for its row `Config`, but `package.json` never
  declared it. A profile install failed before any tool registered with
  `ERR_MODULE_NOT_FOUND: Cannot find package '@deepseek-ai/schemastery'`, so
  the row had no live fiber and **Configure** never opened. It is now a
  runtime dependency (`~3.19.0`), and `Config` is annotated for portable
  declarations.
- The 0.4.2 browser-half fixes are included: the row config entry injects
  `@deepseek-ai/dsh-client-ui-plugin-manager`, and the form keeps one hook
  order while the configuration snapshot loads.
- The docs cleanup from 0.4.2 is unchanged.

## 0.4.2

- **The Plugins page can configure the row.** The browser half declared
  `dsh.client.inject` as `@deepseek-ai/dsh-client-ui-slots`, a package DSH does
  not install, so the client entry never composed and the row showed no
  **Configure** control. It now injects
  `@deepseek-ai/dsh-client-ui-plugin-manager`, which owns
  `plugins.row.config`.
- **The form survives its loading state.** It returned before calling
  `useState`/`useEffect` while the config snapshot loaded, so React saw a
  changed hook order when the values arrived. Hooks now run on every render.
- The form's example origin is `http://localhost:8090`, and a refused save says
  the runtime did not accept the values.
- Client tests cover the hook order and the exact `set` operations sent for the
  API URL and token.
- Docs cleanup: removed setup-era references (the `penpot` CLI, private IP
  examples, `/system status`, a Telegram topic mention), corrected the RPC
  command to `get-project-files`, stopped claiming `penpot_file` returns
  pages, and state 2.18.6 as the tested Penpot version.
- The Penpot RPC calls and tool behavior are unchanged.

## 0.4.1

- Docs only: the README, the design notes and the standalone guide describe the
  plugin on its own terms, with no references to a particular deployment. Same
  code as 0.4.0.

## 0.4.0

- **The plugin has a configuration page.** On DSH `0.2.1-rc.5` or newer, the
  Plugins page shows **Configure** on the `dsh-penpot` row: two fields, API URL
  and access token, saved through the page's own form. No environment export,
  `launchctl setenv` or profile patch is needed on a desktop install. The
  environment values remain the fallback and are overridden by the UI.
- The browser half is plain JavaScript in the client-module format, copied to
  `lib/client.js` by the build; the host half is unchanged.

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
  with provenance.
- **`penpot_import`.** The export counterpart is now a tool: upload a `.penpot`
  file as a new file (`projectId`) or replace an existing one (`fileId`). The
  backend already had the multipart `import-binfile` call; the `penpot` CLI was
  the only caller.
- **Bundle patch corrected.** `cordis.patch.yml` still passed `backend: auto`
  and `mcpServer`, which 0.2.0 removed. The row now declares only `apiUrl` and
  `token`, so a standalone install no longer starts with a stale config key.
- **Builds clean before packaging.** `lib/` is removed before every build, so
  compiled files from removed modules (the old MCP backend) can never enter a
  tarball.
- **The package description no longer claims an MCP backend.** It was stale
  since 0.2.0 and is the text GitHub and npm show.
- **The bundle install is documented as a first-class path**
  (`docs/STANDALONE.md`): no wrapper, same tools.
- **Load fix.** The plugin used `ctx.tools` without declaring
  `inject = ['tools']`; Cordis refuses that property, so a plain profile failed
  at load with `cannot get property "tools" without inject`. Declared now.
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
- README/DESIGN updated for the HTTP-only backend.

## 0.1.2

Docs only: command references updated.

## 0.1.1

- Docs only. The install section leads with the bundle install, pins the manual
  install at a tag, and explains the pnpm `allowBuilds` gate that otherwise
  aborts a git install. Credentials are described as the runtime process's
  environment, not a shell export.
- `COMPATIBILITY.md` records the Penpot versions exercised.

## 0.1.0

- First cut: `penpot_status`, `penpot_teams`, `penpot_projects`,
  `penpot_files`, `penpot_search`, `penpot_file`, `penpot_export`.
- Two backends behind one interface: the HTTP API with an access token, and an
  MCP server already registered in the runtime. `auto` prefers MCP read tools.
- Export writes a `.penpot` file; import is not exposed as a tool yet.
