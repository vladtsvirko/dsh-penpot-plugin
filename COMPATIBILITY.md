# Compatibility

The plugin talks to Penpot, not to DSH internals, so its DSH requirement is only
the peer range of the tool registry. Penpot's RPC is internal and moves between
releases; every row states what was actually exercised.

| Plugin | DSH | Penpot | Status | Notes |
|---|---|---|---|---|
| 0.1.1 | `>=0.1.0-rc.6 <0.3.0-0` | 2.18 | untested against a live instance | docs only: the setup path is documented as primary, the manual install is pinned and the pnpm build gate is explained; same code as 0.1.0 |
| 0.1.0 | `>=0.1.0-rc.6 <0.3.0-0` | 2.18 | untested against a live instance | read tools + export; request shapes checked against Penpot's OpenAPI and a fake server, not a real deployment |

The setup's design component is the reference deployment: `components.json`
pins this plugin at `v0.1.0` and the Penpot images at `2.18`, i.e. the row
above. Moving either is a setup release; the plugin ref in that file is what a
deployment actually installs.

`auto` backend with an MCP server depends on the tool names that server exposes
(`list_teams`, `list_projects`, `list_files`, `search_files`, `get_file` by
default). A server that names its tools differently needs `mcpServer` plus a
mapping, which is an open item in [docs/DESIGN.md](docs/DESIGN.md).
