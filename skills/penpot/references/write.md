# Writing Penpot shapes with `update-file`

The plugin exposes the common primitives as tools:
`penpot_add_frame`, `penpot_add_rect`, `penpot_add_circle`, `penpot_add_text`,
`penpot_update_text`, `penpot_update_shape` and `penpot_delete_shape`. They build the change map below
and apply it against the current file revision. This reference documents the
raw format for anything the tools do not cover (groups, paths, images,
components) and for debugging a refusal.

## Tools first

| Goal | Tool |
|---|---|
| New artboard | `penpot_add_frame` |
| Rectangle / circle | `penpot_add_rect`, `penpot_add_circle` |
| Text | `penpot_add_text` |
| Change copy | `penpot_update_text` |
| Change fill/radius/opacity/name/geometry | `penpot_update_shape` |
| Image | `penpot_add_image` |
| Group / ungroup | `penpot_group_shapes`, `penpot_ungroup_shape` |
| Remove a layer | `penpot_delete_shape` |
| Prototype flow / interaction | `penpot_create_flow`, `penpot_add_interaction` |

The add tools take **page coordinates**, not frame-local coordinates. They
return the new shape id; call `penpot_outline` on the frame to verify. Text
tools create one `positionData` line per explicit newline and compute the box
height, but they do not measure wrapped text.

## The envelope

```json
POST /api/rpc/command/update-file
{
  "id": "<file-id>",
  "session-id": "<random-uuid>",
  "revn": 12,
  "vern": 0,
  "changes": [ … ]
}
```

- Read `revn` and `vern` from `get-file` immediately before writing.
- `revn` is the content revision; `vern` is the version-restore counter.
- A stale `revn` is normally accepted as a base; a **stale `vern`** is a
  `vern-conflict`, and `revn` greater than stored is a `revn-conflict`.
- Use a fresh random UUID for `session-id` per request.
- The response contains the applied changes and the new `revn`. Re-read the file
  or use `penpot_snapshots`/`penpot_outline` to verify.
- Changes are applied in order. Keep one logical operation per request when
  debugging; batch after it works.

## Changes

### `add-obj`

```json
{
  "type": "add-obj",
  "id": "<new-shape-uuid>",
  "page-id": "<page-id>",
  "frame-id": "<frame-id-or-root>",
  "parent-id": "<frame-id-or-root>",
  "index": 0,
  "obj": { … complete shape map … }
}
```

- `frame-id` is the containing frame (or `ROOT` for a top-level frame).
- `parent-id` is the immediate container; for a direct child it equals
  `frame-id`.
- `index` is the insertion position in `parent.shapes`; `0` is the bottom.
- `obj` must be a valid shape map. The reliable way to build one is to clone an
  existing shape of the same type from the target file, then override `id`,
  `name`, `x`, `y`, `width`, `height`, geometry, fills and text. A frame can be
  cloned from the page's root frame; a rect/circle/text from an existing one.
- New shapes need `pageId` set to the target page, `parentId`/`frameId` set,
  `selrect`/`points` consistent with the bounds, and (for text) `positionData`.
- For a top-level frame, `parentId` and `frameId` are `ROOT`, and its `x`/`y`
  are page coordinates.

### `mod-obj`

```json
{
  "type": "mod-obj",
  "id": "<shape-id>",
  "page-id": "<page-id>",
  "operations": [
    { "type": "set", "attr": "name", "val": "New name" },
    { "type": "assign", "value": { "x": 10, "y": 20, "selrect": { … } } }
  ]
}
```

- `set` works for scalar attributes (`name`, `opacity`, `hidden`, `positionData`,
  …). `assign` decodes a map against the shape schema and is the safe way to
  replace geometry (`x`, `y`, `selrect`, `points`, `transform`).
- Setting `selrect` with `set` can fail schema validation; use `assign` for the
  geometry map. This is the difference that produced a 500
  `invalid shape found … :selrect` in testing.
- Moving a shape means updating `x`, `y`, `selrect` and `points` together.
  Children of a frame are stored in page coordinates, so add the frame's
  `x`/`y` when changing a frame-relative intent.

### `del-obj`

```json
{ "type": "del-obj", "id": "<shape-id>", "page-id": "<page-id>" }
```

Deleting a frame deletes its subtree. Take a snapshot first.

### `mov-objects` and `reorder-children`

Both change the parent's `shapes` array. `mov-objects` needs `parent-id`,
`shapes` (array of ids), and optionally `index` or `after-shape`. Use only when
the move is the point of the operation; otherwise delete/re-add is clearer.

### `reg-objects`

Re-register shapes after low-level changes so Penpot recomputes derived data:

```json
{ "type": "reg-objects", "page-id": "<page-id>", "shapes": ["<id>", "<id>"] }
```

## Recipes

### Create a top-level frame

1. Read the file.
2. Clone the page root frame (id `ROOT`) into a new object map.
3. Set `id`, `name`, `type: "frame"`, `x`, `y`, `width`, `height`,
   `parentId: ROOT`, `frameId: ROOT`, `pageId`, `shapes: []`, a solid white fill,
   and matching `selrect`/`points`.
4. `add-obj` with `parent-id: ROOT`, `frame-id: ROOT`.
5. Read the file again; verify the frame and its id.

### Add a child rectangle

1. Find an existing `rect` in the file (or clone a known-good one).
2. Set its page coordinates: `frame.x + local.x`, `frame.y + local.y`.
3. Set `parentId`/`frameId` to the frame, `pageId` to the page, and `fills` to
   `[{fillColor, fillOpacity:1}]`. Set `r1`–`r4` for a radius (and `rx`/`ry` on
   builds that use them).
4. `add-obj` with `index` at the end of `frame.shapes`.
5. Read back and verify the child is in `frame.shapes`.

### Add text that actually renders

1. Clone an existing text shape, or build the full map from a known-good one.
2. Set `content` to a rich-text tree (root → paragraph-set → paragraph → span)
   and `positionData` to at least one laid-out line.
3. `positionData` `x`/`y` are page coordinates; `y` is baseline-based. Use the
   shape's `x` and `y + fontSize * 0.2` as a practical starting point; set
   `width`/`height`/`x1`/`x2`/`y1`/`y2` consistently.
4. Fill both the span and the shape's `positionData` with the same font and
   color. `penpot_add_text` infers a Google-font `fontId` (`gfont-inter`, …)
   from the family; for a custom font, copy the `fontId`/`fontVariantId` from
   an existing text layer.
5. `add-obj`, then read the page and confirm `positionData.length > 0`. A text
   object with no `positionData` can be invisible even though it exists.

### Shift frame children after moving a frame

Children are absolute. Moving the frame's `x`/`y` alone leaves its children
behind. For each direct child, `assign`:

```js
{
  x: child.x + dx,
  y: child.y + dy,
  selrect: { ...child.selrect, x: child.selrect.x + dx, y: child.selrect.y + dy,
             x1: child.selrect.x1 + dx, y1: child.selrect.y1 + dy,
             x2: child.selrect.x2 + dx, y2: child.selrect.y2 + dy },
  points: child.points.map(p => ({ x: p.x + dx, y: p.y + dy })),
  ...(child.type === 'text' && child.positionData
    ? { positionData: child.positionData.map(p => ({ ...p, x: p.x + dx, y: p.y + dy })) }
    : {})
}
```

## Images, groups and prototypes

- **Image:** upload media first (`upload-file-media-object` multipart with field
  `content`, or `create-file-media-object-from-url`), then add an `image` shape
  with `metadata: {id, width, height, mtype}`. `metadata.id` is the media object
  id, not the storage `mediaId`.
- **Group:** `penpot_group_shapes` adds a group with the selected child ids,
  rewrites the frame's `shapes` order, and assigns each child's `parentId`.
  Penpot's `mov-objects` change alone did not update parent links in testing, so
  the tool uses the explicit parent/shape changes. `penpot_ungroup_shape` clears
  the group's `shapes` before deleting it; otherwise `del-obj` cascades to the
  children.
- **Flow:** `set-flow` uses the client JSON key `starting-frame`; the stored
  page data returns it as `startingFrame`.
- **Interaction:** append to `shape.interactions` and `assign` the array. Raw
  interaction keys are `eventType` / `actionType`, not kebab-case.

## Validation and debugging

- `skip-validate: true` exists, but do not use it to force an invalid shape.
  Fix the map.
- A 500 `invalid shape found … :selrect` means a `set` on a compound attribute;
  use `assign`.
- A 400 `params-validation` usually names the offending key; the `explain`
  string is the fastest clue.
- After a write, re-read with `get-page` and run `penpot_outline`/`penpot_audit`
  from the plugin. The write can succeed at HTTP level while the shape renders
  invisibly.
- If a frame or child is blank, check (in this order): missing `positionData`
  for text, frame-local instead of absolute coordinates, missing
  `parentId`/`frameId`, missing fill, missing `pageId`.
- Take a `penpot_snapshots` create before a batch. Restoring is possible through
  Penpot's version history; a snapshot label makes it findable.
