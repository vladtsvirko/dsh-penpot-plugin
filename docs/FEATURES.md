# Penpot integration: feature survey

This is the map behind the plugin's tool surface. It answers two questions:
what the Penpot RPC can do, and what this plugin deliberately exposes.

Tested against Penpot 2.18.6. The RPC is internal and moves between 2.x minors.
Command names below come from the 2.18.6 backend source
(`backend/src/app/rpc/commands/*.clj`, 150 `defmethod`s); response shapes were
checked against a live deployment.

## At a glance

| Capability | Status | Plugin surface |
|---|---|---|
| Teams, projects, files, file search | covered | `penpot_teams`, `penpot_projects`, `penpot_files`, `penpot_search` |
| File identity | covered | `penpot_file` |
| Pages and top-level frames | covered | `penpot_pages` |
| Layer tree, bounds, styles, text | covered | `penpot_outline` |
| Layer search by name/text/type | covered | `penpot_find` |
| Design-token library and used values | covered | `penpot_tokens` |
| Accessibility / design QA | covered | `penpot_audit` |
| Comment threads and replies | read + write | `penpot_comments`, `penpot_create_comment_thread`, `penpot_reply_comment`, `penpot_resolve_comment` |
| Version snapshots | read + create | `penpot_snapshots` |
| Linked libraries | read | `penpot_libraries` |
| Built-in templates | read + clone | `penpot_templates`, `penpot_clone_template` |
| Create project/file | write | `penpot_create_project`, `penpot_create_file` |
| Duplicate file | write | `penpot_duplicate_file` |
| Whole-file export/import | write | `penpot_export`, `penpot_import` |
| Shape writes | frames, rects, circles, text, images, groups, property updates, delete | `penpot_add_frame`, `penpot_add_rect`, `penpot_add_circle`, `penpot_add_text`, `penpot_add_image`, `penpot_group_shapes`, `penpot_ungroup_shape`, `penpot_update_text`, `penpot_update_shape`, `penpot_delete_shape` |
| Advanced shape writes | documented | paths, booleans, component creation via `update-file`; skill `references/write.md` |
| Components | read | `penpot_components`, `penpot_component_instances` |
| Prototype | read + write | `penpot_prototype`, `penpot_create_flow`, `penpot_add_interaction` |
| Frame preview | SVG + optional PNG | `penpot_frame_svg`, `penpot_frame_png` |
| Media / object thumbnail bytes | blocked by deployment | `penpot_download_asset` once `/assets/by-id/` is proxied |
| Per-frame preview | best-effort | `penpot_frame_svg`, `penpot_frame_png` (user browser) |
| Component creation/sync | not exposed | read/inspect only |
| Team administration, auth, billing, webhooks, error reports | not exposed | out of scope |

## Why these boundaries

### Shape writes

`update-file` is the only write path for shapes. The plugin builds the required
shape core (identity, geometry, transform, parent links) and exposes frames,
rectangles, circles, text creation, text replacement and deletion. The builders
were validated against Penpot 2.18.6 with a real blank file: frame → rects/text →
outline/audit → update copy → delete.

The tools deliberately cover the primitives an agent needs to draw and iterate
a screen. `penpot_update_shape` changes fill, radius, opacity, name and geometry;
a frame move shifts its descendants, while a frame resize leaves them in place.
Booleans, paths and component creation still require the raw change format;
adding each needs a reliable schema/template and a component-heavy fixture.
`update-file` remains the advanced escape hatch, documented in the skill.

### Comments write

Reading, creating, replying and resolving are exposed. The design decision is
confirmation: a reply is a message to a human, and resolving a thread closes
feedback. Keep those actions explicit. Editing and deleting individual comments
are exposed as explicit tools.

### Text layout

`penpot_add_text` and `penpot_update_text` use an approximate glyph metric and
greedy word wrapping (`wrap: true`, the default). Each line gets a
`positionData` entry with the line's left edge, measured width and baseline near
the line bottom; `wrap: false` keeps explicit lines. The default font is
Penpot's built-in Source Sans Pro so a self-hosted deployment without Google
Fonts does not fall back to serif. The metric is an estimate: unusual fonts,
ligatures and very long words can still differ.

### Media and thumbnails

`get-file-object-thumbnails` returns a map of object key → media id. The bytes
live at `/assets/by-id/<media-id>` and require the token. On the test deployment
the public origin serves `/assets` as static frontend files and returns an nginx
404 for that path; the backend ports are not exposed. The same proxy gap blocks
`export-binfile` downloads. This is a deployment fix, not a plugin feature.
Per-frame raster export is not an RPC command at all: Penpot renders it in the
browser with its WASM renderer. The plugin offers best-effort SVG and a
user-configured headless-browser PNG; exact rendering remains a browser-side
problem.

### Design tokens

Penpot 2.18 stores a DTCG-style token library in `data.tokensLib`: nested sets,
`$themes`, `$metadata.activeSets`/`activeThemes`, aliases and math expressions.
The plugin reads the active sets, resolves aliases, and turns math (`8*1.25`) into
CSS pixels. Shapes may also use raw values; `penpot_tokens` reports those under
`used`. This is more useful than a color histogram because it separates authored
tokens from one-off usage.

### Components and prototypes

Components are read-only: `data.components` carries path/name/main instance, and
the tool inspects the main instance tree when the component object map is not
returned by `get-file`. Creating components or instances still requires the raw
`update-file` changes.

Prototype flows are page-level `flows` maps; interactions live on shapes.
`penpot_prototype` reads both. `penpot_create_flow` uses `set-flow`;
`penpot_add_interaction` appends to `shape.interactions`. Navigation, overlay,
back and open-url are supported; animation/overlay positioning are not exposed.

### Frame preview

There is no Penpot per-frame export RPC. `penpot_frame_svg` renders a subset
(frames, rects, circles, text, groups, solid styles) and reports limitations.
`penpot_frame_png` sends that SVG through a user-configured headless browser.
Neither is Penpot's WASM canvas; images are placeholders, paths/effects are
omitted, and no browser is bundled. `penpot_download_asset` covers direct asset
bytes once the deployment proxies `/assets/by-id/`.

## Command inventory

The 2.18.6 RPC has 150 commands. Grouped by area:

| Area | Commands (examples) | Notes |
|---|---|---|
| Teams and projects | `get-teams`, `get-team`, `get-team-members`, `create-team`, `create-project`, `rename-project`, `duplicate-project`, `move-project`, `delete-project` | Admin surface; only project creation is exposed. |
| Files | `get-project-files`, `get-team-recent-files`, `search-files`, `get-file`, `get-file-summary`, `get-file-info`, `get-file-stats`, `get-page`, `get-file-fragment`, `create-file`, `rename-file`, `duplicate-file`, `move-files`, `delete-file`, `export-binfile`, `import-binfile` | Core plugin surface; `get-file-fragment` is for embedded fragments, not used. |
| Comments | `get-comment-threads`, `get-comment-thread`, `get-comments`, `create-comment-thread`, `create-comment`, `update-comment`, `delete-comment`, `update-comment-thread`, `update-comment-thread-status` | Read, create, reply, edit, delete and resolve. |
| Snapshots | `get-file-snapshots`, `get-file-snapshot`, `create-file-snapshot`, `restore-file-snapshot`, `delete-file-snapshot`, `lock-file-snapshot`, `unlock-file-snapshot` | List/create exposed; restore/lock/delete are deliberate omissions. |
| Libraries | `get-file-libraries`, `get-library-file-references`, `link-file-to-library`, `unlink-file-from-library`, `get-library-usage`, `update-file-library-sync-status` | Read exposed; linking is a design-system admin action. |
| Templates | `get-builtin-templates`, `clone-template` | Exposed; clone can create one or more files. |
| Fonts | `get-font-variants`, `create-font-variant`, `update-font`, `delete-font`, `download-font`, `download-font-family` | Not exposed; the design agent can use font names from shapes. |
| Media | `upload-file-media-object`, `create-file-media-object-from-url`, `assemble-file-media-object`, `clone-file-media-object`, `create-upload-session`, `upload-chunk`, `get-file-object-thumbnails`, `create-file-object-thumbnail`, `delete-file-object-thumbnail` | Image upload exposed via `penpot_add_image`; asset bytes via `penpot_download_asset` when proxied. |
| Design tokens | `update-file` change types (`set-token`, `set-token-set`, `set-token-theme`, `set-active-token-themes`) | Token writes are part of `update-file`; not exposed. |
| Auth and profile | `login-with-password`, `login-with-ldap`, `verify-token`, `create-access-token`, `get-access-tokens`, `delete-access-token`, `update-profile*`, `register-profile`, `recover-profile` | Out of scope; the plugin takes an existing token. |
| Team admin | invitations, roles, membership, organization, subscription, nitrate/SSO | Out of scope. |
| Misc | `get-enabled-flags`, `get-error-reports`, `send-user-feedback`, `push-audit-events`, `demo/*` | Out of scope. |

## Design choices

- **One backend seam.** Every tool calls `PenpotBackend`, never `fetch`
  directly. The API implementation is one file; tests use a fake HTTP server.
- **Page-scoped reads.** `get-file` is expensive on a real design. The analysis
  tools take a page and the outline takes a root, so the model can stay bounded.
- **Text reports, not schema trees.** The model reads a rendered outline/audit;
  the tool schema stays one string. This keeps a 300-shape page from becoming a
  giant JSON result and makes truncation explicit.
- **Design tokens are resolved, not guessed.** Alias resolution and math use the
  library's own data; the audit uses actual text/fill values.
- **No silent mutation.** Snapshots/creation are explicit; there is no “clean up
  my design” action that edits unknown shapes.

## Candidate next steps

1. **Exact text metrics** — replace the approximate wrap with font-file metrics
   where available.
2. **More primitives** — paths, booleans and component instances.
3. **Component creation/sync** — create a main component, place instances.
4. **Preview fidelity** — real image bytes in SVG/PNG, paths and effects;
   optional headless Chromium rendering of Penpot's viewer.
5. **Media bytes** — requires the `/assets/by-id/` proxy.
6. **Design diff** — compare a snapshot/export with the current file.

## Verifying a feature

1. Read the command spec from the installed Penpot version, not memory.
2. Call it against a disposable project; record the raw response shape.
3. Add a backend method and a fake-server test for the mapping.
4. Add a pure design test if it analyses shapes.
5. Run `npm run typecheck && npm test && npm run build`.
6. Update `COMPATIBILITY.md` with the tested Penpot version.
