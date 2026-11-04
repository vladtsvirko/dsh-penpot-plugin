# Changelog

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
