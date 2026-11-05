# Compatibility

The plugin talks to Penpot, not to DSH internals, so its DSH requirement is only
the peer range of the tool registry. Penpot's RPC is internal and moves between
releases; every row states what was actually exercised.

| Plugin | DSH | Penpot | Status | Notes |
|---|---|---|---|---|
| 0.2.0 | `>=0.1.0-rc.6 <0.3.0-0` | 2.18.6 | API exercised against a live self-hosted instance | API only: the optional MCP backend and `backend`/`mcpServer` config were removed; the plugin now loads unconfigured and `penpot_status` says `none` |
| 0.1.2 | `>=0.1.0-rc.6 <0.3.0-0` | 2.18 | untested against a live instance | docs only: `/system components` after the setup rename; same code as 0.1.1 |
| 0.1.1 | `>=0.1.0-rc.6 <0.3.0-0` | 2.18 | untested against a live instance | docs only: the setup path is documented as primary, the manual install is pinned and the pnpm build gate is explained; same code as 0.1.0 |
| 0.1.0 | `>=0.1.0-rc.6 <0.3.0-0` | 2.18 | untested against a live instance | read tools + export; request shapes checked against Penpot's OpenAPI and a fake server, not a real deployment |

The setup's design component is the reference deployment: `components.json`
pins this plugin at `v0.2.0` and the Penpot images at `2.18`. Moving either is a setup release; the plugin ref in that file is what a
deployment actually installs.
