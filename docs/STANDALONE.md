# Use with any DSH runtime

`dsh-penpot-plugin` is a normal DSH bundle. It needs a Penpot instance and an
access token; it has no other dependency and makes no assumption about the
runtime it is installed into.

## Requirements

| What | Why |
|---|---|
| DSH matching the range in [COMPATIBILITY.md](../COMPATIBILITY.md) | the tool registry API |
| A reachable Penpot instance (2.18.x; 2.18.6 tested) | the HTTP RPC backend |
| A Penpot access token | Settings → Access tokens |
| Node 22 | the plugin's engine requirement |
| pnpm | `dsh plugin` forwards package operations to it |

## Install

```sh
# Published package: the tarball already contains lib/, so no build script.
dsh plugin --profile penpot add dsh-penpot-plugin@0.10.3
```

From the source repository instead, allow the build and pin the tag:

```yaml
allowBuilds:
  dsh-penpot-plugin@https://github.com/vladtsvirko/dsh-penpot-plugin.git: true
```
```sh
dsh plugin --profile penpot add github:vladtsvirko/dsh-penpot-plugin#v0.10.3
```

The bundle's own patch inserts the `dsh-penpot` row. On DSH `0.2.1-rc.5` or
newer, configure it in the UI: **Plugins** → **dsh-penpot-plugin** →
**Configure**, set the API URL and the access token, **Save**. The page writes
the row's config; no environment export is needed.

The bundle also registers its `penpot` skill on `ctx.skills`, so the agent has
the workflow and the RPC notes as soon as the Host row is active. No separate
skill directory or profile entry is needed.

Frame PNG preview is optional: set **Headless browser** on the Plugins page to
an absolute Chrome/Chromium/Edge executable. The SVG preview and all other tools
work without it. The browser renders the plugin's best-effort SVG, not Penpot's
canvas.

For an older DSH or a headless profile, the row reads both values from the
runtime environment:

```sh
export PENPOT_API_URL='http://yourpenpot.url'   # /api/rpc suffix is optional
export PENPOT_ACCESS_TOKEN='...'
dsh --profile penpot
```

Export the variables in the environment that starts the runtime. A shell export
made after the runtime is already running does not reach it. The UI values
override the environment.

## Verify

Ask the agent for `penpot_status`. It reports either `api <url>` or
`none — not configured`, naming the missing variables. The other tools return
one readable error when the backend is unconfigured; the plugin itself still
loads, so a missing token never takes the runtime down.

## Update and remove

```sh
dsh plugin --profile penpot remove dsh-penpot-plugin
dsh plugin --profile penpot add dsh-penpot-plugin@<new>
```

The host's plugin manager refuses to install a git package over an installed
one, so removal comes first. Restart the runtime if the command reports
`restart-required`.
