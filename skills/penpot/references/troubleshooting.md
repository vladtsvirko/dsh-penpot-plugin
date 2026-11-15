# Penpot troubleshooting

## “Penpot is not configured”

The API URL and access token must both be non-empty. Set them on the Plugins page
(row config) or in `PENPOT_API_URL` / `PENPOT_ACCESS_TOKEN`. `penpot_status`
reports `none` without them. The token is a Penpot access token, not the account
password; create one in Penpot under Account → Access tokens.

The values live in the DSH profile user layer and take effect on the next tool
call because the plugin reads volatile config at call time. Do not print the
token into a transcript, design file or commit.

## 401 / 403

- 401: missing, malformed or revoked token. Re-create the token.
- 403: the token's profile cannot read/write this file/team. Check team
  membership and file permissions.
- A 404 with `{"type":"not-found"}` for a real id is often a permission denial
  disguised as absence. Verify the id and the account.

## 400 `params-validation`

The `explain` field names the failing path. Usual causes:

- camelCase keys in a request (the API wants kebab-case);
- a missing `file-id` when `object-id` is used with `get-page`;
- a malformed UUID;
- a change map missing a required key (`page-id`, `parent-id`, `frame-id`);
- `team-id` required for a resource that is team-scoped.

## 404 on `/assets/by-id/…`

Penpot's export and media endpoints return URLs under `/assets/by-id/…`. If the
public proxy serves the frontend only, those URLs return an nginx 404 HTML page.
The export RPC has already succeeded at that point; the download is blocked by
the deployment. The proxy must forward `/assets/by-id/` to the backend (the same
origin that serves the RPC API). This is not a plugin bug and not fixable from
the token.

## Image URL rejected

- `ssrf-blocked-target`: Penpot refuses private/LAN addresses. Use a local
  `path` upload or a genuinely public URL.
- `unable-to-download-image`: the Penpot server cannot reach the URL. A URL that
  works from the DSH host is not necessarily reachable from the Penpot host.
- `media-type-not-allowed`: the upload's MIME type is missing or unsupported.
  The plugin sends the type from the file extension; use PNG/JPEG/WebP/GIF/SVG.
- Media uploads use multipart field `content`; a JSON `content` map is not a
  file upload.

## Native PNG fails

- `penpot_native_png needs Penpot email/password`: set the optional PNG-export
  credentials on the Plugins page, or use `penpot_frame_png`.
- `penpot_native_png needs the headless browser path`: set the browser path in
  the same PNG-export group. Native export needs both.
- `login returned no session cookie`: the login endpoint refused or changed its
  cookie name. Check the email/password with the Penpot UI.
- `Penpot render page did not expose #screenshot-…`: the session has no access
  to the file/project, the render page failed, or the frame id is wrong. Check
  the target account's team/project membership.
- A Chrome/DevTools launch failure usually means the browser path is wrong, the
  binary is not Chromium-compatible, or the host blocks loopback debugging
  ports.
- Never paste the password into a design, comment, or tool result. Use a
  dedicated account; clear the field when not needed.

## Headless preview fails

- `penpot_frame_png needs a headless browser`: set the absolute browser path on
  the Plugins page (or `PENPOT_BROWSER_PATH`).
- The browser must support `--headless=new`. Point at a current Chrome/Chromium.
- Exit 0 with no file, or a size mismatch, usually means the screenshot flag was
  not honoured; inspect the browser's stderr.
- The PNG is the plugin's SVG, not Penpot's canvas. Images are placeholders and
  paths/effects are omitted; use `penpot_frame_svg` and read `limitations`.
- On Linux, a root/sandbox setup may need a non-root user; the plugin does not
  add `--no-sandbox`.

## Export “finished without a download URL”

The `end` event shape changed across Penpot versions:

- older: a plain URL string;
- 2.18: `{"~#uri":"http://…/assets/by-id/…"}`.

The plugin accepts plain, `uri` and `~#uri`. If it still fails, log the raw
`end` event and compare. Also check that the request's `Accept` header is JSON;
the response is SSE with transit-encoded data.

## Export download 401

The `/assets/by-id/…` URL requires the same `Authorization: Token …` header for
same-origin downloads. The plugin sends it only when the URL is on the configured
Penpot origin; a presigned third-party URL must not receive it. If a proxy
rewrites the URL to a different origin, decide deliberately whether to forward
the token.

## `update-file` 400 or 500

- `params-validation` on `add-obj` usually means the shape map is incomplete:
  `id`, `name`, `type`, `x/y/width/height`, `selrect`, `points`, `transform`,
  `transform-inverse`, `parent-id` and `frame-id` are mandatory, and a frame
  also needs `shapes`.
- A 500 `invalid shape found … :selrect` usually means a `mod-obj` `set` on a
  compound attribute. Use `assign` for geometry and `content`/`positionData`.
- A `vern-conflict` means the file's restore counter moved; re-read and retry.
  A `revn-conflict` means the incoming revision is greater than the stored one.
- The plugin's add tools build the required core; prefer them for frames,
  rectangles, circles and text.

## Blank or missing text after a write

A text shape can exist in the data and be invisible when it has no
`positionData`. Add at least one line entry with `x`, `y`, `width`, `height`,
`x1/y1/x2/y2`, font, size, weight, fill and text. See `shapes.md` and
`write.md`. After writing, read the page and check
`positionData.length > 0`.

## A child renders at the wrong place

Children are stored in absolute page coordinates. If a frame is at `x=430` and
the child should be 24px inside, the data needs `x=454`. Moving a frame does not
move its children; shift each child's `x`, `y`, `selrect`, `points` and text
`positionData` together.

## 500 `invalid shape found … :selrect`

Using `mod-obj`'s `set` operation on `selrect` fails schema validation. Use
`assign` with a map containing `x`, `y`, `selrect`, `points`, and optionally
`positionData`. The same applies to compound geometry.

## `revn-conflict` / `vern-conflict`

- `revn` is the content revision; a stale base is usually accepted, but a
  version greater than the stored one is rejected.
- `vern` is the restore counter; it must match exactly. Re-read the file after a
  snapshot restore or a concurrent edit and retry with the current `revn`/`vern`.
- Do not retry blindly on a conflict: re-read, merge, then write. Take a snapshot
  before the retry.

## `ERR_MODULE_NOT_FOUND` for a plugin dependency

A DSH host row fails before any tool if a runtime import is not declared in the
plugin's own dependencies. Do not rely on a transitive package. For this plugin,
`@deepseek-ai/schemastery` is a runtime dependency; align it with the DSH
version. Install/upgrade from the Plugins page and check the row is active.

## The Configure button or form is missing

- The row must be active and the client half loaded. In Desktop, a newly
  installed client plugin may need a full app restart (the production menu has no
  Reload Page). DevTools (`Developer tools` in the app menu) can run
  `location.reload()` as a fallback.
- The row config key is `<package name>#<row id>`; a wrong package or row id
  gives no Configure control.
- The settings form only exists when the config has volatile fields. Ordinary
  fields are not projected into the settings namespace, so the page opens without
  a form.
- If the form says it does not expose configuration, check both the client
  registration and the volatile schema.

## A tool result is huge or slow

`get-file` reads the whole design. Prefer page-scoped tools:

- `penpot_outline` with `pageId` and `rootId`;
- `penpot_find` with a query;
- `penpot_audit` with a page;
- `penpot_tokens` with a page.

For an outline, set `depth` and `maxShapes`. The tool reports when it truncates.

## Comments are empty

`get-comment-threads` returns only threads visible to the account. On a file
with no comments it returns `[]`. A thread anchor needs `frame-id` and
`page-id`; if you create one manually, use a point inside the frame. The plugin
can create, reply, edit, delete and resolve threads/comments; a thread anchor
needs a frame and page.

## Templates

`get-builtin-templates` lists the deployment's configured templates. A clone
uses SSE; the final `end` event carries the new file id. A clone can take a while
on a large template. If the id is missing, inspect the `error` event and the
`end` payload; some builds return a vector of ids.

## Penpot version drift

The RPC is internal. Shape fields, transit encoding and SSE event payloads can
change between 2.x minors. When a new Penpot version is deployed:

1. run `penpot_status`, `penpot_pages`, `penpot_outline`, `penpot_tokens`;
2. export and import a copy;
3. check `/assets/by-id/` and the token library;
4. record the tested version in `COMPATIBILITY.md` and cut a release if the
   plugin changed.
