---
name: penpot
description: Use when working with Penpot design files through DeepSeek Harness: inspect pages and layers, extract design tokens, audit accessibility, draw frames, text, images and groups, inspect components and prototypes, preview frames, read and write comments, manage versions and files, or export and import .penpot files.
---

# Penpot

Penpot is a design tool; the `dsh-penpot-plugin` tools speak to its HTTP RPC API.
Use the tools to read the actual file instead of guessing what a screen contains.

## Start here

1. Call `penpot_status`. If it reports `none`, ask the user to set the API URL
   and access token on the Plugins page (or set `PENPOT_API_URL` /
   `PENPOT_ACCESS_TOKEN`).
2. Find the object: `penpot_teams` → `penpot_projects` → `penpot_files` (or
   `penpot_search`).
3. Understand the file: `penpot_pages` for pages and frames, then
   `penpot_outline` for one page or frame.
4. Go deeper with `penpot_tokens`, `penpot_audit`, `penpot_comments`,
   `penpot_snapshots` and `penpot_libraries`.

Ids are UUIDs. Never invent one; copy an id from a tool result. A *file* has
pages; a *page* has frames and loose shapes; a *frame* is the artboard an agent
usually means by “screen”.

## Tool map

| Goal | Tool |
|---|---|
| Check configuration | `penpot_status` |
| Find a team, project, file | `penpot_teams`, `penpot_projects`, `penpot_files`, `penpot_search` |
| Identify one file | `penpot_file` |
| Pages and frame list | `penpot_pages` |
| Layer tree, bounds, styles, text | `penpot_outline` |
| Find layers by name or text | `penpot_find` |
| Design tokens (library + used) | `penpot_tokens` |
| Accessibility and design QA | `penpot_audit` |
| Design feedback | `penpot_comments` |
| Version history | `penpot_snapshots` |
| Linked design systems | `penpot_libraries` |
| Create a project / file | `penpot_create_project`, `penpot_create_file` |
| Draw a frame / rect / circle / text | `penpot_add_frame`, `penpot_add_rect`, `penpot_add_circle`, `penpot_add_text` |
| Add an image | `penpot_add_image` |
| Group / ungroup | `penpot_group_shapes`, `penpot_ungroup_shape` |
| Change a shape | `penpot_update_shape` |
| Change copy in place | `penpot_update_text` |
| Delete a layer or subtree | `penpot_delete_shape` |
| Components | `penpot_components`, `penpot_component_instances` |
| Prototype flows | `penpot_prototype`, `penpot_create_flow`, `penpot_add_interaction` |
| Preview a frame | `penpot_frame_svg`, `penpot_frame_png` |
| Start a comment, reply, edit, resolve | `penpot_create_comment_thread`, `penpot_reply_comment`, `penpot_update_comment`, `penpot_delete_comment`, `penpot_resolve_comment` |
| Duplicate a baseline | `penpot_duplicate_file` |
| Start from a template | `penpot_templates`, `penpot_clone_template` |
| Whole-file backup / restore | `penpot_export`, `penpot_import` |

## Working rules

- **Read before writing.** `penpot_pages` and `penpot_outline` are cheap compared
  with guessing a frame id or a layout.
- **Pages, frames, coordinates.** Penpot stores child shapes in absolute page
  coordinates. The add tools also take page coordinates. If a frame is at
  `x=430` and the child should be 24px inside it, pass `x=454`, not `24`.
- **Write in small steps.** Create a frame, then its children, then re-read with
  `penpot_outline`. Snapshot before a batch or a delete; `penpot_delete_shape`
  is not undoable through this plugin.
- **Text wrapping is approximate.** `wrap: true` is the default: the tool
  estimates line breaks from the font size and width and writes one
  `positionData` entry per line. Penpot still owns final layout; a very long word
  or an unusual font can differ. Set `wrap: false` for exact explicit lines.
- **Images have two sources.** `path` uploads a local file through the multipart
  RPC; `url` asks the Penpot server to fetch a public URL. Penpot blocks private
  addresses, so a LAN URL is rejected even when DSH can reach it.
- **Preview is best-effort.** `penpot_frame_svg` covers frames, rects, circles,
  text, groups and solid styles; image bytes and paths are placeholders/omitted.
  `penpot_frame_png` needs the headless browser path configured on the Plugins
  page and renders the same SVG, not Penpot's exact canvas.
- **Text is a rich-text tree.** `shape.content` is not a string. `penpot_outline`
  already extracts it; for raw JSON use the recursion in
  `references/shapes.md`.
- **Tokens are two things.** A file may have a design-token library
  (`data.tokensLib`) and shapes may use raw colors/typography. `penpot_tokens`
  reports both; `format: "css"` gives a `:root` block.
- **The audit is a review aid.** Contrast uses the nearest filled sibling or
  frame behind the text; gradients, images and complex stacking can make it
  approximate. Treat a finding as a prompt to inspect, not a proof.
- **Snapshots are safety.** Before an import or a risky redesign, call
  `penpot_snapshots` with `create`. Penpot keeps the history entry.
- **Secrets stay out of files.** The access token is a profile credential. Do not
  print it, write it into a design, or commit it.

## Common workflows

### Understand a screen
`penpot_pages` → pick a frame → `penpot_outline` with `rootId` and a modest
`depth` → `penpot_find` for a specific label → `penpot_tokens` for the styles.

### Design to code
1. `penpot_outline` to get the frame structure and text.
2. `penpot_tokens` (JSON) for colors, typography and radii.
3. `penpot_tokens` with `format: "css"` when the target is CSS variables.
4. `penpot_find` to confirm every visible string and its intended layer.
5. Implement the UI in the target framework, then compare against the outline.

See `references/design-to-code.md` for a mapping checklist.

### Design review
`penpot_audit` first, then `penpot_outline` on the flagged frames. Report the
rule, the measured value and the layer id; do not silently change the design.

### Draw a screen
1. `penpot_create_file` (or pick an existing file and `penpot_pages`).
2. `penpot_add_frame` at the page origin; keep its id.
3. `penpot_add_rect` for header/card/button surfaces; coordinates are page
   coordinates, so add the frame's `x`/`y` to the intended inside position.
4. `penpot_add_text` for copy; pass `fontSize`, `fontWeight`, `color`, `align`.
5. `penpot_add_circle` for avatars or decorative dots.
6. `penpot_add_image` for a cover/photo; use a local `path` when a URL is not
   publicly reachable by the Penpot server.
7. `penpot_group_shapes` for a repeated cluster; `penpot_ungroup_shape` reverses
   it. `penpot_outline` with `rootId` = frame id, then `penpot_audit`.
8. Fix copy with `penpot_update_text`; adjust fill, radius, opacity, name or
   geometry with `penpot_update_shape`; remove a trial layer with
   `penpot_delete_shape`.
9. Preview with `penpot_frame_svg`; use `penpot_frame_png` only when a headless
   browser is configured. Treat both as a fidelity check, not a Penpot screenshot.

A rectangle added after text sits on top; use `index` to control stacking
(`0` is the bottom) or add backgrounds first.

### Understand components and prototypes
`penpot_components` lists components; pass `componentId` to inspect its main
instance tree. `penpot_component_instances` finds usages.
`penpot_prototype` reads flows and shape interactions. `penpot_create_flow`
starts a flow at a frame; `penpot_add_interaction` appends a click/navigation,
overlay, back or open-url action. Components are read-only in this release.

### Preview a frame
`penpot_frame_svg` writes an SVG without any browser. For PNG, configure the
headless browser path in the Plugins page and call `penpot_frame_png`. The
renderer covers the shapes the plugin creates; it does not reproduce gradients,
shadows, masks, booleans, custom paths or live component expansion. Report the
`limitations` list rather than implying a pixel-perfect export.

### Address feedback
`penpot_comments` lists threads. Pass a `threadId` to read replies; use the
`frameId` and `position` to locate the area, and `penpot_find` to identify the
layer. Reply with `penpot_reply_comment`; mark it resolved with
`penpot_resolve_comment` once the design question is settled.

### Create or copy a design
- `penpot_create_project` → `penpot_create_file` for a blank file.
- `penpot_templates` → `penpot_clone_template` for a starter kit.
- `penpot_duplicate_file` before a risky redesign.
- `penpot_import` only with a real `.penpot` file produced by `penpot_export` or
  another trustworthy source.

### Export or migrate
`penpot_export` writes a `.penpot` zip on disk. Read it with the normal file
tools; import it with `penpot_import`. The export endpoint returns Server-Sent
Events and the download URL may be on `/assets/by-id/`; if the deployment does
not proxy that route, the export fails after Penpot answers 200. See
`references/troubleshooting.md`.

## Limits to state plainly

- The RPC API has **no per-frame PNG/SVG export**. `penpot_export` exports the
  whole `.penpot` file only. Object thumbnails are metadata ids, not a portable
  image API.
- `penpot_file` reports id and name. Use `penpot_pages` for pages; some Penpot
  builds return no `pages` array from `get-file-summary`.
- A large file makes `get-file` expensive. Prefer tools that accept `pageId`
  (`penpot_outline`, `penpot_find`, `penpot_audit`).
- Shape writes cover **frames, rectangles, circles, text, images, groups,
  property updates and delete**. Moving a frame shifts its descendants; resizing
  a frame does not. Paths, booleans and component creation still need the raw
  `update-file` format; see `references/write.md`.
- Comment write covers thread creation, replies, editing, deletion and resolve.
- Component support is read-only. `penpot_components` inspects the main
  instance when the component object map is not returned.
- Frame preview is an approximation. `penpot_frame_png` requires a user-provided
  browser; no browser is bundled.
- This skill documents Penpot 2.x RPC behavior, tested with 2.18.6. A shape or
  command change is a compatibility event; widen testing or cut a release.

## References

| Read this | When |
|---|---|
| `references/rpc.md` | Exact commands, params and response shape |
| `references/shapes.md` | Penpot shape/text data model and coordinates |
| `references/write.md` | `update-file` change format and safe write recipes |
| `references/preview.md` | SVG/PNG preview, renderer limits and browser config |
| `references/design-to-code.md` | Turning a Penpot frame into implementation |
| `references/troubleshooting.md` | Auth, 4xx/5xx, SSE, export, revision conflicts |
