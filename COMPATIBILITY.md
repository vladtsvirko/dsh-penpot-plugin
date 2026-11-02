# Compatibility

The plugin talks to Penpot, not to DSH internals, so its DSH requirement is only
the peer range of the tool registry. Penpot's RPC is internal and moves between
releases; every row states what was actually exercised.

| Plugin | DSH | Penpot | Status | Notes |
|---|---|---|---|---|
| 0.1.0 | `>=0.1.0-rc.6 <0.3.0-0` | 2.18 | untested against a live instance | read tools + export; request shapes checked against Penpot's OpenAPI and a fake server, not a real deployment |

`auto` backend with an MCP server depends on the tool names that server exposes
(`list_teams`, `list_projects`, `list_files`, `search_files`, `get_file` by
default). A server that names its tools differently needs `mcpServer` plus a
mapping, which is an open item in [docs/DESIGN.md](docs/DESIGN.md).
