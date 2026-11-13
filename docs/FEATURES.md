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
| Comment threads and replies | read | `penpot_comments` |
| Version snapshots | read + create | `penpot_snapshots` |
| Linked libraries | read | `penpot_libraries` |
| Built-in templates | read + clone | `penpot_templates`, `penpot_clone_template` |
| Create project/file | write | `penpot_create_project`, `penpot_create_file` |
| Duplicate file | write | `penpot_duplicate_file` |
| Whole-file export/import | write | `penpot_export`, `penpot_import` |
| Shape-level writes | documented, not exposed | skill `references/write.md` |
| Comment create/reply/resolve | not exposed | read-only by design |
| Media / object thumbnail bytes | blocked by deployment | metadata only via `get-file-object-thumbnails` |
| Per-frame PNG/SVG export | not in RPC | whole-file export only |
| Components / variants / prototype flows | not exposed | open candidate |
| Team administration, auth, billing, webhooks, error reports | not exposed | out of scope |

## Why these boundaries

### Shape writes

`update-file` is the only write path for shapes, and it takes a change list
against Penpot's full shape schema. We proved frames, rects, circles and text on
2.18.6 (see the skill's `write.md`), but a general “add a shape” tool needs a
reliable template per shape type, text layout, and a conflict policy. The
current release keeps the read/analyse/manage surface honest and documents the
write format instead of shipping a half-safe editor. The next release can add
`add frame` / `add rect` / `add text` on top of the same backend seam.

### Comments are read-only

Reading feedback is safe and useful for a design agent. Creating or resolving a
thread changes a human conversation; a tool should be explicit about that, and
the plugin should not resolve feedback without the user asking. The RPC commands
exist (`create-comment-thread`, `create-comment`, `update-comment`,
`update-comment-thread`, `update-comment-thread-status`) and are a straightforward
follow-up.

### Media and thumbnails

`get-file-object-thumbnails` returns a map of object key → media id. The bytes
live at `/assets/by-id/<media-id>` and require the token. On the test deployment
the public origin serves `/assets` as static frontend files and returns an nginx
404 for that path; the backend ports are not exposed. The same proxy gap blocks
`export-binfile` downloads. This is a deployment fix, not a plugin feature.
Per-frame raster export is not an RPC command at all: Penpot renders it in the
browser with its WASM renderer. The honest options are whole-file export, or a
browser-side renderer, or waiting for an API.

### Design tokens

Penpot 2.18 stores a DTCG-style token library in `data.tokensLib`: nested sets,
`$themes`, `$metadata.activeSets`/`activeThemes`, aliases and math expressions.
The plugin reads the active sets, resolves aliases, and turns math (`8*1.25`) into
CSS pixels. Shapes may also use raw values; `penpot_tokens` reports those under
`used`. This is more useful than a color histogram because it separates authored
tokens from one-off usage.

### Components and prototypes

Penpot files can contain components, component sets, variants and prototype
flows. `get-file` carries them in the file data, but the 2.18.6 test files did
not exercise them, so this release does not claim a schema. A `penpot_components`
tool is a good next step once a component-heavy file is available for testing;
the same applies to prototype flow inspection.

## Command inventory

The 2.18.6 RPC has 150 commands. Grouped by area:

| Area | Commands (examples) | Notes |
|---|---|---|
| Teams and projects | `get-teams`, `get-team`, `get-team-members`, `create-team`, `create-project`, `rename-project`, `duplicate-project`, `move-project`, `delete-project` | Admin surface; only project creation is exposed. |
| Files | `get-project-files`, `get-team-recent-files`, `search-files`, `get-file`, `get-file-summary`, `get-file-info`, `get-file-stats`, `get-page`, `get-file-fragment`, `create-file`, `rename-file`, `duplicate-file`, `move-files`, `delete-file`, `export-binfile`, `import-binfile` | Core plugin surface; `get-file-fragment` is for embedded fragments, not used. |
| Comments | `get-comment-threads`, `get-comment-thread`, `get-comments`, `create-comment-thread`, `create-comment`, `update-comment`, `update-comment-thread`, `update-comment-thread-status` | Read + reply; only read is exposed. |
| Snapshots | `get-file-snapshots`, `get-file-snapshot`, `create-file-snapshot`, `restore-file-snapshot`, `delete-file-snapshot`, `lock-file-snapshot`, `unlock-file-snapshot` | List/create exposed; restore/lock/delete are deliberate omissions. |
| Libraries | `get-file-libraries`, `get-library-file-references`, `link-file-to-library`, `unlink-file-from-library`, `get-library-usage`, `update-file-library-sync-status` | Read exposed; linking is a design-system admin action. |
| Templates | `get-builtin-templates`, `clone-template` | Exposed; clone can create one or more files. |
| Fonts | `get-font-variants`, `create-font-variant`, `update-font`, `delete-font`, `download-font`, `download-font-family` | Not exposed; the design agent can use font names from shapes. |
| Media | `upload-file-media-object`, `create-file-media-object-from-url`, `assemble-file-media-object`, `clone-file-media-object`, `create-upload-session`, `upload-chunk`, `get-file-object-thumbnails`, `create-file-object-thumbnail`, `delete-file-object-thumbnail` | Not exposed; byte access is proxy-blocked. |
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

1. **Shape writes** — `penpot_add_frame`, `penpot_add_rect`, `penpot_add_text`,
   `penpot_update_text`; template cloning from the target file, absolute
   coordinate conversion, `positionData`, `revn` retry, snapshot before batch.
2. **Comment write** — reply and resolve, with an explicit user confirmation
   pattern.
3. **Components** — list components/variants/instances and their usage.
4. **Prototype flows** — read start points and connections.
5. **Media download** — once the deployment proxies `/assets/by-id/`; return a
   local preview path.
6. **Design diff** — compare a snapshot/export with the current file and report
   changed frames/layers.

## Verifying a feature

1. Read the command spec from the installed Penpot version, not memory.
2. Call it against a disposable project; record the raw response shape.
3. Add a backend method and a fake-server test for the mapping.
4. Add a pure design test if it analyses shapes.
5. Run `npm run typecheck && npm test && npm run build`.
6. Update `COMPATIBILITY.md` with the tested Penpot version.
