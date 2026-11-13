# Penpot shapes and text

A file is a map of pages. A page is a flat map of objects plus a root object.

```
file.data.pages              -> [pageId, …]           order
file.data.pagesIndex[pageId] -> { id, name, objects }
page.objects[id]             -> shape
page.objects[ROOT]           -> root frame sentinel
```

`ROOT = 00000000-0000-0000-0000-000000000000`.

A frame is a shape with `type: "frame"`. Top-level frames have
`parentId === ROOT`; sub-frames and groups nest. `frame.shapes` is the ordered
child-id array (z-order, bottom to top). A child also carries `parentId` and
`frameId`; for a direct child of a frame both equal the frame id.

## Shape fields

| Field | Meaning |
|---|---|
| `id`, `name`, `type` | identity and layer type (`frame`, `rect`, `circle`, `text`, `path`, `group`, `image`, `bool`, …) |
| `x`, `y`, `width`, `height` | **absolute page coordinates** |
| `selrect` | `{x,y,width,height,x1,y1,x2,y2}` in page space |
| `points` | rotated bounds corners |
| `parentId`, `frameId` | tree links |
| `shapes` | ordered child ids on containers |
| `fills` | array; a solid fill is `{fillColor:"#RRGGBB", fillOpacity:1}` |
| `strokes` | array; `strokeColor`, `strokeWidth`, `strokeStyle`, `strokeOpacity` |
| `r1`…`r4` | corner radii |
| `opacity` | 0…1 |
| `content` | rich-text tree for `type: "text"` |
| `positionData` | laid-out text lines (font, size, fill, x/y/width/height) |

Do not assume every shape has every field. Newer Penpot versions add fields; the
plugin's types expose the stable ones and keep the rest as unknown.

## Coordinates are absolute

This is the most common source of blank or misplaced output. When adding a
child through `update-file`, send page coordinates:

```
absolute.x = frame.x + local.x
absolute.y = frame.y + local.y
```

If a frame is at page `x=430` and a child should sit 24px from the frame's left
edge, the child's `x` is `454`, not `24`. The same applies to `selrect`,
`points`, and text `positionData`.

## Text

`shape.content` is a rich-text tree, not a string:

```json
{
  "type": "root",
  "children": [{
    "type": "paragraph-set",
    "children": [{
      "type": "paragraph",
      "children": [{
        "type": "span",
        "text": "Welcome back",
        "fontFamily": "Inter",
        "fontSize": "24",
        "fontWeight": "600",
        "fills": [{ "fillColor": "#111827", "fillOpacity": 1 }]
      }]
    }]
  }]
}
```

Extraction:

```js
const textOf = (node) => {
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (node === null || typeof node !== 'object') return ''
  let out = typeof node.text === 'string' ? node.text : ''
  for (const child of node.children ?? []) out += textOf(child)
  if (node.type === 'paragraph' && out && !out.endsWith('\n')) out += '\n'
  return out
}
```

Typography inherits from paragraph to span. Use the span's values when present,
otherwise the nearest ancestor values. `positionData` mirrors the laid-out lines
and is a reliable fallback when `content` is missing.

### `positionData` is mandatory for visible text

A text shape added through `update-file` with `content` but no `positionData`
can exist in the data and render blank. Add at least one entry:

```js
{
  x: shape.x,
  y: shape.y + fontSize * 0.2,
  width: shape.width,
  height: fontSize * 1.4,
  x1: 0, y1: 0, x2: shape.width, y2: fontSize * 1.4,
  fontStyle: 'normal',
  textTransform: 'none',
  fontSize: `${fontSize}px`,
  fontWeight: String(fontWeight),
  textDecoration: 'none',
  letterSpacing: 'normal',
  fills: [{ fillColor: color, fillOpacity: 1 }],
  direction: 'ltr',
  fontFamily,
  text
}
```

`positionData.y` is baseline/layout based, not a simple top edge. Do not use its
vertical extent to decide whether text overflows a box; width is the reliable
axis.

## Fills and strokes

Solid fill: `{"fillColor":"#2563EB","fillOpacity":1}`.
Gradient fills use a different map (`fillColorGradient`); do not assume
`fillColor` exists. Stroke width is a number; `strokeStyle` can be `solid`,
`dashed`, `dotted`, `mixed`, etc.

## Groups, booleans, paths and images

- `group` and `bool` are containers with `shapes`.
- `path` carries path data; do not try to reconstruct it from bounds.
- `image` shapes reference media by id; the plugin does not download media.
- `component` instances/`component` main instances have extra fields. Inspect
  them, but do not clone a component by copying its map blindly; copy the file
  or use Penpot's own duplication.

## Reading recommendations

- For a screen, use `penpot_outline` with `rootId` = frame id and `depth` 3–4.
- For a specific label, use `penpot_find` with the visible text.
- For styles, use `penpot_tokens`; it walks fills, strokes, text runs and radii
  and separates the token library from actually-used values.
- For a large file, page-scoped reads are cheaper than `get-file`.
