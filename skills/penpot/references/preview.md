# Frame preview

Penpot has no per-frame export command. The plugin has two preview tools with
different fidelity:

| Tool | Needs | Output |
|---|---|---|
| `penpot_frame_svg` | nothing extra | best-effort SVG |
| `penpot_frame_png` | `browserPath` in the row config | PNG rendered by that browser |
| `penpot_native_png` | browserPath + Penpot email/password | Penpot's own render page (exact) |

The first two do not use Penpot's renderer. The native path does; it is the
opt-in exact option.

## SVG coverage

Supported:

- frame background and size;
- rectangles with solid fill, stroke and a single corner radius;
- circles/ellipses;
- text using `positionData` lines, font family/size/weight, fill and alignment;
- groups and nested frames;
- opacity.

Placeholders or omissions:

- images are gray placeholders (the renderer does not fetch media bytes);
- paths, booleans and SVG-raw shapes are omitted;
- gradients, shadows, blurs, masks and blend modes are not reproduced;
- component instances are not expanded beyond the shapes present in the page;
- rotations and non-identity transforms are not applied;
- text wrapping uses the plugin's approximate metrics.

`penpot_frame_svg` returns a `limitations` list. Report it with the file.

## PNG browser configuration

Set **Headless browser** on the Plugins page to an absolute executable path:

- macOS: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- Chrome/Chromium/Edge on Linux or Windows: the browser executable
- A Chromium-compatible binary works; the plugin does not bundle one

The plugin writes a temporary SVG and runs the browser with:

```
--headless=new --disable-gpu --hide-scrollbars
--window-size=<w>,<h> --screenshot=<path>
```

`--headless=new` needs a current Chrome/Chromium. If the configured binary does
not support it, point `browserPath` at a current Chrome/Chromium or use the SVG
tool. No `--no-sandbox` is added; do not run the plugin as a privileged user.

The browser is also a trust boundary: only configure a binary you trust.

## Native export

`penpot_native_png` performs:

1. `POST /api/rpc/command/login-with-password` with the configured email/password;
2. capture the `auth-token` session cookie;
3. launch the configured headless Chrome with CDP;
4. set the cookie for the Penpot origin and open
   `/render.html?file-id=…&page-id=…&object-id=…&route=objects`;
5. wait for `#screenshot-<frame-id>` and fonts;
6. capture the element at the requested scale.

This is Penpot's render page, not the plugin's SVG renderer. It does **not** use
`/api/export` or `/assets/by-id`, so it works without the asset proxy. It needs
both the browser path and the credentials. The access token is not accepted by
the render page; the login session cookie is.

The password is stored in the plugin's profile config, so use a dedicated
Penpot account. The browser is launched with an isolated temp profile and a
short-lived debugging port; the cookie is not persisted.

## Fidelity tips

- Use `wrap: true` when creating text; otherwise the SVG can clip long lines.
- Keep effects and images out of the preview expectation until the asset proxy
  and renderer support them.
- A PNG is the renderer's view of the SVG, not Penpot's view of the design.
- For exact output, use Penpot's own export UI or a browser-side Penpot plugin;
  that is outside this plugin.
