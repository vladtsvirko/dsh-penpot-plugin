# Compatibility

The plugin talks to Penpot, not to DSH internals, so its DSH requirement is only
the peer range of the tool registry. Penpot's RPC is internal and moves between
releases; every row states what was actually exercised.

| Plugin | DSH | Penpot | Status | Notes |
|---|---|---|---|---|
| 0.4.2 | `>=0.1.0-rc.6 <0.3.0-0` | 2.18.6 | client entry fix targeted at DSH 0.2.2-rc.2; slot registration and save payload covered by tests | fixes the non-existent client inject package and the form hook order; docs cleanup |
| 0.4.1 | `>=0.1.0-rc.6 <0.3.0-0` | 2.18.6 | docs only; same code as 0.4.0 | rewrote the README and guides for standalone use |
| 0.4.0 | `>=0.1.0-rc.6 <0.3.0-0` | 2.18.6 | config page loads on DSH 0.2.1-rc.5 (Plugins → Configure); host API unchanged | adds a browser half (`plugins.row.config`) with API URL and token fields |
| 0.3.1 | `>=0.1.0-rc.6 <0.3.0-0` | 2.18.6 | live instance: teams/projects/search/import/export exercised | fixes the JSON accept header, the SSE export/import responses and the required `team-id` on search |
| 0.3.0 | `>=0.1.0-rc.6 <0.3.0-0` | 2.18.6 | API import covered by a fake server; live instance run is the release gate | adds `penpot_import`; bundle patch drops the removed `backend`/`mcpServer` keys; standalone install documented |
| 0.2.0 | `>=0.1.0-rc.6 <0.3.0-0` | 2.18.6 | API exercised against a live self-hosted instance | API only: the optional MCP backend and `backend`/`mcpServer` config were removed; the plugin now loads unconfigured and `penpot_status` says `none` |
| 0.1.2 | `>=0.1.0-rc.6 <0.3.0-0` | 2.18 | untested against a live instance | docs only: command references updated; same code as 0.1.1 |
| 0.1.1 | `>=0.1.0-rc.6 <0.3.0-0` | 2.18 | untested against a live instance | docs only: the install section is reworked and the pnpm build gate is explained; same code as 0.1.0 |
| 0.1.0 | `>=0.1.0-rc.6 <0.3.0-0` | 2.18 | untested against a live instance | read tools + export; request shapes checked against Penpot's OpenAPI and a fake server, not a real deployment |

The plugin version is independent of DSH. Each row records the Penpot version
that was actually exercised; the DSH range is the peer range of the tool
registry. A newer compatible version installed from the Plugins page stays
installed across reboots.
