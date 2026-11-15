# Compatibility

The plugin talks to Penpot, not to DSH internals, so its DSH requirement is only
the peer range of the tool registry. Penpot's RPC is internal and moves between
releases; every row states what was actually exercised.

| Plugin | DSH | Penpot | Status | Notes |
|---|---|---|---|---|
| 0.10.2 | `>=0.1.0-rc.6 <0.3.0-0` | 2.18.6 | live data corrected to built-in `sourcesanspro`; Pulse demo re-laid; font-family resolution checked against Penpot's `local-fonts` source | patch for 0.10.1 font family: display name vs CSS family; baseline fix included |
| 0.10.1 | `>=0.1.0-rc.6 <0.3.0-0` | 2.18.6 | live: text layout corrected against Penpot's real positionData; Pulse demo re-rendered; 0.10.0 features retested by the demo | patch for 0.10.0 text baseline/line width and default font (Source Sans Pro); 44 tools, 41 tests |
| 0.10.0 | `>=0.1.0-rc.6 <0.3.0-0` | 2.18.6 | live: wrapped text, local image upload, group/ungroup, components list/inspect, flow+interaction, frame SVG and headless Chrome PNG, comment edit/delete; asset download blocked by known proxy gap | final pre-1.0 release; 44 tools; approximate text metrics; user-configured headless browser for PNG; paths/booleans/component creation still raw `update-file` |
| 0.6.1 | `>=0.1.0-rc.6 <0.3.0-0` | 2.18.6 | live update-shape: fill, radius, name, opacity, text move, frame+child move, delete; 0.6.0 draw/comment suite | adds `penpot_update_shape`; frame move shifts descendants, resize does not; export/media still need `/assets/by-id` proxy |
| 0.6.0 | `>=0.1.0-rc.6 <0.3.0-0` | 2.18.6 | live blank-file draw: frame, rect, circle, text, update text, delete; comment create/reply/resolve; read/analysis suite from 0.5.0 | adds 9 write tools and shape builders; explicit-newline text layout; export/media still need `/assets/by-id` proxy |
| 0.5.0 | `>=0.1.0-rc.6 <0.3.0-0` | 2.18.6 | live reads: pages, outline, find, tokens, audit, comments, snapshots, libraries, templates, create/duplicate file, clone template; export code unchanged | adds 13 tools and the shipped `penpot` skill; export download still needs `/assets/by-id` proxying; shape writes documented, not exposed |
| 0.4.6 | `>=0.1.0-rc.6 <0.3.0-0` | 2.18.6 | export end event and same-origin auth fixed; the test origin answers nginx 404 for `/assets/by-id/` | decodes `~#uri`; sends the token on same-origin downloads; Save button contrast; public origin must proxy `/assets/by-id` |
| 0.4.5 | `>=0.1.0-rc.6 <0.3.0-0` | 2.18.6 | row config form uses DSH theme tokens and shows saved state on DSH 0.2.2-rc.2 | UI-only follow-up to 0.4.4; no host or Penpot RPC changes |
| 0.4.4 | `>=0.1.0-rc.6 <0.3.0-0` | 2.18.6 | volatile row config exposed on DSH 0.2.2-rc.2; Configure form covered by client tests | makes `apiUrl`/`token` volatile so the settings namespace and form appear; values apply live |
| 0.4.3 | `>=0.1.0-rc.6 <0.3.0-0` | 2.18.6 | host row active on DSH 0.2.2-rc.2; client config entry covered by tests | declares `@deepseek-ai/schemastery` (`~3.19.0`) so the row starts; includes the 0.4.2 client inject and hook fixes |
| 0.4.2 | `>=0.1.0-rc.6 <0.3.0-0` | 2.18.6 | client entry fix targeted at DSH 0.2.2-rc.2; slot registration and save payload covered by tests | fixes the non-existent client inject package and the form hook order; docs cleanup; host row could not start because `@deepseek-ai/schemastery` was undeclared |
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
