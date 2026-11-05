# Changelog

## 0.2.0

- **MCP backend removed.** The plugin talks to Penpot's local HTTP RPC only.
  `backend`, `mcpServer` and the `mcp__<server>__*` adapter are gone; the
  read-only MCP path could not export and could silently replace the API via
  `auto`.
- The plugin now loads even when `PENPOT_API_URL`/`PENPOT_ACCESS_TOKEN` are
  empty: `penpot_status` reports `none`, the other tools throw one readable
  configuration error.
- README/DESIGN updated for the systemd/Podman setup (`--design penpot`).

## 0.1.2

Docs only. The setup path now says `/system components` (the command was renamed
from `/system manage`).

## 0.1.1

- Docs only. The install section now leads with the DSH setup's design
  component (`install.sh --design docker` / `/system manage`), pins the manual
  install at a tag, and explains the pnpm `allowBuilds` gate that otherwise
  aborts a git install. Credentials are described as the runtime process's
  environment, not a shell export.
- `COMPATIBILITY.md` records that the setup pins this plugin and the Penpot
  images, so a ref or image bump is a setup release.

## 0.1.0

- First cut: `penpot_status`, `penpot_teams`, `penpot_projects`,
  `penpot_files`, `penpot_search`, `penpot_file`, `penpot_export`.
- Two backends behind one interface: the HTTP API with an access token, and an
  MCP server already registered in the runtime. `auto` prefers MCP read tools.
- Export writes a `.penpot` file; import is not exposed as a tool yet.
