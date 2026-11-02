# Changelog

## 0.1.0

- First cut: `penpot_status`, `penpot_teams`, `penpot_projects`,
  `penpot_files`, `penpot_search`, `penpot_file`, `penpot_export`.
- Two backends behind one interface: the HTTP API with an access token, and an
  MCP server already registered in the runtime. `auto` prefers MCP read tools.
- Export writes a `.penpot` file; import is not exposed as a tool yet.
