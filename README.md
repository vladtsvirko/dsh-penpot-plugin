# dsh-penpot-plugin

Penpot for [DeepSeek Harness](https://github.com/deepseek-ai): discover and
inspect design files, extract tokens, audit accessibility, draw frames, text,
images and groups, read and write feedback, inspect components and prototypes,
preview frames as SVG or PNG, manage versions and files, and export or import
`.penpot` archives over Penpot's HTTP RPC API.

The plugin is a normal DSH bundle. It talks to a Penpot instance you run
(2.18.6 is the tested version) and needs an API origin and an access token;
nothing else.

It also ships a **Penpot skill** (`skills/penpot/`) that the Host registers on
`ctx.skills`, so the agent gets the workflow and the RPC/shape knowledge without
a second install. The write tools cover frames, rectangles, circles, text,
images, groups, comment threads and prototype flows. Paths, booleans and
component creation still use the raw `update-file` format documented in the
skill's `references/write.md`.

## Install

The plugin is published to npm as an exact version:

```sh
dsh plugin --profile <profile> add dsh-penpot-plugin@0.10.1
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
dsh plugin --profile <profile> add github:vladtsvirko/dsh-penpot-plugin#v0.10.1
```

The package is a plugin bundle: `cordis.patch.yml` mounts one `dsh-penpot` row.

## Configure

On DSH `0.2.1-rc.5` or newer, open **Plugins** → **dsh-penpot-plugin** and press
**Configure** on the `dsh-penpot` row. Set:

- **API URL** — the Penpot origin, for example `http://yourpenpot.url`
  (include the port if your instance uses one; no `/api/rpc` suffix;
  `https://…:8443` works when the CA is trusted).
- **Access token** — create it in Penpot → Settings → Access tokens.
- **Headless browser (optional)** — absolute path to Chrome, Chromium or Edge.
  Only `penpot_frame_png` needs it; `penpot_frame_svg` works without a browser.
  The browser renders the plugin's best-effort SVG, not Penpot's exact canvas.

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
| `penpot_pages` | pages and top-level frames, with sizes and layer counts |
| `penpot_outline` | layer tree with bounds, fills, typography and text |
| `penpot_find` | find layers by name or text |
| `penpot_tokens` | token library + used colors/typography/radii; JSON or CSS |
| `penpot_audit` | WCAG contrast, small text, overflow, empty frames, duplicate names |
| `penpot_comments` | comment threads and replies |
| `penpot_snapshots` | list or create file version snapshots |
| `penpot_libraries` | linked design-system libraries |
| `penpot_templates` | built-in Penpot templates |
| `penpot_create_project` | create a project |
| `penpot_create_file` | create an empty file |
| `penpot_duplicate_file` | duplicate a file as a baseline |
| `penpot_clone_template` | clone a built-in template into a project |
| `penpot_add_frame` | create a top-level frame/artboard |
| `penpot_add_rect` | add a rectangle inside a frame |
| `penpot_add_circle` | add a circle/ellipse inside a frame |
| `penpot_add_image` | upload a local image or public URL and place it |
| `penpot_add_text` | add a text layer with typography and color |
| `penpot_update_shape` | change name, fill, radius, opacity or geometry |
| `penpot_update_text` | replace a text layer's copy and re-layout it |
| `penpot_group_shapes` | group sibling shapes |
| `penpot_ungroup_shape` | move a group's children back to its frame |
| `penpot_delete_shape` | delete a layer or a frame subtree |
| `penpot_components` | list components or inspect one |
| `penpot_component_instances` | list component instances |
| `penpot_prototype` | read flows and interactions |
| `penpot_create_flow` | create a prototype flow |
| `penpot_add_interaction` | add a click/navigation interaction |
| `penpot_create_comment_thread` | start a comment thread on a frame |
| `penpot_reply_comment` | reply to a thread |
| `penpot_update_comment` | edit a comment |
| `penpot_delete_comment` | delete a comment |
| `penpot_resolve_comment` | resolve or reopen a thread |
| `penpot_frame_svg` | render a frame to best-effort SVG |
| `penpot_frame_png` | render a frame to PNG via the configured browser |
| `penpot_download_asset` | download an asset id when `/assets/by-id/` is proxied |
| `penpot_export` | write a `.penpot` file to disk |
| `penpot_import` | upload a `.penpot` file as a new or replacement file |

The read tools are designed for large files: `penpot_outline`, `penpot_find`,
`penpot_audit` and `penpot_tokens` accept a `pageId` and the outline accepts a
`rootId` plus depth/shape limits. `penpot_pages` and `penpot_tokens` load the
whole file: pages and the design-token library are file-level data.

`penpot_tokens` reports both the file's design-token library (DTCG-style sets,
themes, aliases) and the colors, typography and radii actually used on a page.
`format: "css"` resolves Penpot math expressions such as `8*1.25` into usable
`px` values.

Shape writes take **page coordinates**, matching `penpot_outline`: if a frame is
at `x=430`, a child 24px inside it is `x=454`. Text uses an approximate wrap by
default (`wrap: true`); turn it off with `wrap: false` for exact explicit lines.
`penpot_update_shape` changes fill, radius, opacity, name or geometry; moving a
frame also shifts its descendants, while resizing a frame does not. Take a
snapshot before a batch or a delete. The add tools return the new shape id; use
`penpot_outline` on the frame to verify.

Images can come from a local path or a public URL. Penpot blocks private/SSRF
targets, so a URL only works when the Penpot server can fetch it; a local path
is uploaded through the multipart RPC. Frame preview is deliberately
best-effort: the SVG renderer covers frames, rects, circles, text, groups and
solid styles, and the PNG tool sends that SVG through the configured browser.
Neither is Penpot's own canvas renderer; paths, effects and real image bytes are
not reproduced yet.

Export gives a zip of Penpot JSON: unzip it, read or edit with the normal file
tools, then import it back with `penpot_import` — no extra CLI and no second
toolchain. A new file needs `projectId`; replacing one needs `fileId`.
**Snapshot first** when the file matters.

Penpot returns the export as an `/assets/by-id/…` URL. The public origin must
proxy that path to the backend; a reverse proxy that serves `/assets` only as
static frontend files answers 404. Object thumbnails are metadata ids and need
the same proxy; per-frame PNG/SVG export is not part of the RPC API.

## Skill

`skills/penpot/SKILL.md` is registered automatically with the plugin's Host row.
It routes the agent through discovery, outline, tokens, audit, comments,
versioning and export/import, and carries the RPC and shape notes in
`skills/penpot/references/`:

- `rpc.md` — commands, params, SSE/transit, export/import;
- `shapes.md` — shape/text data model, absolute coordinates, `positionData`;
- `write.md` — `update-file` changes, geometry, text, images and groups;
- `design-to-code.md` — mapping a frame to implementation;
- `preview.md` — SVG/PNG preview fidelity and browser configuration;
- `troubleshooting.md` — auth, 4xx/5xx, export proxy, revision conflicts.

If the catalog does not show `penpot` after install, confirm the Host row is
active and restart the Desktop app; client/Host compositions load at boot.

## Backend

One backend: Penpot's HTTP RPC.

- `POST /api/rpc/command/<name>` with `Authorization: Token …`, kebab-case
  payloads. Read: `get-teams`, `get-projects`/`get-all-projects`,
  `get-project-files`, `search-files`, `get-file-summary`, `get-file`,
  `get-page`, `get-comment-threads`/`get-comments`, `get-file-snapshots`,
  `get-file-libraries`, `get-builtin-templates`. Write: `create-project`,
  `create-file`, `duplicate-file`, `clone-template`, `create-file-snapshot`,
  `update-file`, `create-comment-thread`, `create-comment`,
  `update-comment-thread`, `export-binfile`, `import-binfile`.
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
