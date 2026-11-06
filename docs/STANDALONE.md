# Standalone use

`dsh-penpot-plugin` is a normal DSH bundle. The setup's design component is a
convenience: it installs Penpot, the `penpot` CLI and this plugin, and wires the
environment. None of that is required by the plugin.

## Requirements

| What | Why |
|---|---|
| DSH matching the range in [COMPATIBILITY.md](../COMPATIBILITY.md) | the tool registry API |
| A reachable Penpot instance (2.x) | the HTTP RPC backend |
| A Penpot access token | Settings → Access tokens |
| Node 22 and pnpm | `dsh plugin`; source installs also need the build script |

## Install

```sh
# Published package: the tarball already contains lib/, so no build script.
dsh plugin --profile penpot add dsh-penpot-plugin@0.3.0
```

From the source repository instead, allow the build and pin the tag:

```yaml
allowBuilds:
  dsh-penpot-plugin@https://github.com/vladtsvirko/dsh-penpot-plugin.git: true
```
```sh
dsh plugin --profile penpot add github:vladtsvirko/dsh-penpot-plugin#v0.3.0
```

The bundle's own patch inserts the `dsh-penpot` row and reads both values from
the runtime environment, so there is no configuration file to edit:

```sh
export PENPOT_API_URL='http://192.168.2.50:8090'   # /api/rpc suffix is optional
export PENPOT_ACCESS_TOKEN='...'
dsh --profile penpot
```

Export the variables in the environment that starts the runtime. A shell export
made after the runtime is already running does not reach it.

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
`restart-required`. In a setup deployment the bot does this through the plugin
manager and wraps it in a rollback trial (`/system update penpot`); the package
and the row are exactly the same.

## What the setup adds

| Setup feature | Standalone equivalent |
|---|---|
| `install.sh --design penpot` installs Penpot and the token | run Penpot yourself |
| managed `dsh-penpot` row in `cordis.patch.yml` | the bundle's own insert row |
| `/system components` enable/disable | `dsh plugin … add/remove` |
| `/system update penpot` with a trial | the two `dsh plugin` commands above |
| `/system rollback` | keep the previous tag; re-add it |

Nothing in the tool surface changes. The setup adds lifecycle and packaging, not
capability.
