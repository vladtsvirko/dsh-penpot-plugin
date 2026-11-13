# Design to code with Penpot

The goal is not to dump a layer tree into a prompt; it is to recover the design
decisions that matter and to avoid inventing what the file does not say.

## Workflow

1. **Locate the frame.** `penpot_pages` → frame id. If the user names a screen,
   `penpot_find` on its title text is often faster than reading every page.
2. **Read the structure.**
   `penpot_outline` with `rootId` = frame id, `depth` 3–4. Note container order,
   spacing, text, and which layers are decorative.
3. **Read the styles.**
   `penpot_tokens` (JSON). Separate:
   - token-library values (named, reusable, may be themed);
   - used colors/typography/radii (what this page actually renders).
4. **Read the strings.**
   `penpot_find` on each visible label, or read them from the outline. Do not
   replace user-facing text with placeholders unless asked.
5. **Map to the target.**
   Layout → flex/grid; fills → color variables; typography → font tokens;
   radii → radius tokens; borders → border tokens. Keep component boundaries
   when the design has repeated groups.
6. **Implement and compare.**
   Re-read the outline after implementation if the design changed. The audit is
   a useful second pass for contrast and small text.

## Mapping checklist

| Penpot | Typical code |
|---|---|
| frame `390×844` | page/container width and min-height |
| absolute child positions | padding/gap/positioning; do not hard-code every coordinate |
| `fills[].fillColor` | background-color / color token |
| `strokes[]` | border / outline |
| `r1`–`r4` | border-radius (per-corner if different) |
| text span `fontFamily`/`fontSize`/`fontWeight` | font-family / font-size / font-weight |
| `lineHeight` | line-height (Penpot stores a multiplier like `1.4`) |
| `letterSpacing` | letter-spacing (Penpot stores px) |
| text `textAlign` | text-align |
| `opacity` | opacity |
| repeat of a group | component / repeated markup |

## Tokens

`penpot_tokens` JSON has two useful sections:

- `library.sets`, `library.themes`, `library.tokens` — the file's design-token
  library. `library.tokens[].path` is the token name; `resolved` is the final
  value after alias resolution; `value` is the raw value (often `{alias}`).
- `used.colors`, `used.typography`, `used.radii` — values actually present on
  the selected page, with counts and example layer names.

Prefer the library for naming, and `used` for what this screen needs. If the
library is absent, derive names from usage (`header`, `body`, `accent`) rather
than inventing a scale.

`format: "css"` emits a `:root` block. It is a starting point: rename variables
to the project's convention and remove unused entries.

## Fidelity traps

- Penpot stores absolute coordinates. A child at `x=454` in a frame at `x=430`
  is 24px from the frame edge. Convert to padding/gap in code.
- Text `positionData` is layout data, not a CSS box. Use the outline's text and
  typography, not the raw line coordinates, to reconstruct copy.
- Frames can be nested. A "card" frame's children are relative to the page in
  data but visually relative to the card; preserve the visual nesting.
- Images and paths are referenced, not embedded. The plugin does not download
  media; ask the user for assets or export the file for asset extraction.
- A color used once may be a one-off, not a token. Do not promote every hex to a
  design token.
- The audit's contrast result is approximate when the background is a gradient,
  image or complex stack. Verify visually before changing a brand color.

## Handoff note

When reporting back, include:

- file/page/frame ids used;
- the frame size and main sections;
- token names and values you mapped;
- text you preserved verbatim;
- parts you approximated (images, custom fonts, complex paths);
- any audit finding you intentionally left alone.
