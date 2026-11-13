# Penpot RPC notes

Tested against Penpot `2.18.6`. The API is internal, not a versioned public
contract; recheck after a Penpot upgrade.

## Transport

- Base URL: the deployment origin, e.g. `http://penpot.example:8090`.
  `normalizeBase` accepts a trailing `/` or `/api/rpc`.
- Endpoint: `POST {base}/api/rpc/command/{kebab-case-command}`.
- Headers: `Authorization: Token <access-token>`, `Accept: application/json`,
  `Content-Type: application/json`.
- The access token is a profile credential created in Penpot (Account →
  Access tokens). It is not the password.
- JSON request keys are kebab-case (`file-id`, `project-id`, `team-id`); response
  keys are camelCase (`fileId`, `projectId`, `teamId`).
- Errors are HTTP 4xx/5xx with a JSON body such as
  `{"type":"validation","code":"params-validation","explain":"…"}`.
- Large reads, exports and imports are expensive. Prefer page-scoped commands.

## Commands the plugin uses

### Discovery

| Command | Body | Returns |
|---|---|---|
| `get-teams` | `{}` | team refs |
| `get-projects` | `{"team-id"}` | project refs |
| `get-all-projects` | `{}` | project refs |
| `get-project-files` | `{"project-id"}` | file refs |
| `search-files` | `{"team-id","search-term"}` | file refs |
| `get-file-summary` | `{"id"}` | summary; `pages` may be absent |
| `get-file` | `{"id"}` | whole file: `data.pages`, `data.pagesIndex`, `data.tokensLib`, `data.typographies` |
| `get-page` | `{"file-id","page-id"?,"object-id"?}` | one page; `object-id` prunes to a subtree |
| `get-file-stats` | `{"id"}` | counts (2.17+) |

`get-page` without `page-id` returns the first page. `object-id` requires
`page-id`. `get-file` is the only read that includes the token library and all
pages.

### Comments

| Command | Body | Returns |
|---|---|---|
| `get-comment-threads` | `{"file-id"}` | threads with `seqn`, `content`, `pageId`, `frameId`, `position`, `isResolved`, counts |
| `get-comments` | `{"thread-id"}` | replies with `ownerFullname`, `createdAt`, `content` |

Comments can also be scoped by `team-id`; the plugin uses file scope.
`position` is a page-space point. `frameId` is the anchor frame.

### Version history

| Command | Body | Returns |
|---|---|---|
| `get-file-snapshots` | `{"file-id"}` | `id`, `label`, `revn`, `createdAt`, `createdBy` |
| `create-file-snapshot` | `{"file-id","label"?}` | the new snapshot |
| `get-file-snapshot` | `{"file-id","id"}` | a read-only historical file bundle |
| `restore-file-snapshot` | `{"file-id","id"}` | restore (destructive history operation) |

Snapshots are visible in Penpot's version history. Creating one before an import
is cheap safety.

### Libraries and templates

| Command | Body | Returns |
|---|---|---|
| `get-file-libraries` | `{"file-id"}` | linked libraries, including transitive |
| `get-library-file-references` | `{"file-id"}` | files using this file as a library |
| `get-builtin-templates` | `{}` | `id`, `name` |
| `clone-template` | `{"project-id","template-id"}` | SSE; end event is a vector with the new file id |

### File management

| Command | Body | Returns |
|---|---|---|
| `create-project` | `{"team-id","name"}` | project |
| `create-file` | `{"project-id","name"}` | whole file; use its `id` |
| `duplicate-file` | `{"file-id","name"?}` | whole file |
| `rename-file` | `{"id","name"}` | file |
| `move-files` | `{"ids":[…],"project-id"}` | no content |
| `delete-file` | `{"id"}` | soft delete; avoid without a snapshot |

### Export / import

| Command | Body | Notes |
|---|---|---|
| `export-binfile` | `{"file-id","include-libraries","embed-assets"}` | SSE; `end` data is the download URL, often `{"~#uri":"…"}` |
| `import-binfile` | multipart with `file`, `project-id` or `file-id`, `name` | SSE; `end` data is a vector of file ids |

Export download:

- Resolve the URL against the deployment origin.
- Send the access token only when the URL is same-origin. A presigned
  third-party URL must not receive the token.
- Penpot serves the zip from `/assets/by-id/…`; the deployment's public proxy
  must forward that path to the backend. A 404 HTML page there is a proxy gap,
  not a plugin bug.

## SSE and transit

Export, import and clone-template stream Server-Sent Events:

```
event: progress
data: {"~:section":"~:file"}

event: end
data: ["~u<uuid>"]
```

- Split events on a blank line; `event:` names the type, `data:` is the payload.
- Transit markers seen from these endpoints: `~u` (uuid), `~:` (keyword/map key),
  `~#` (tagged value such as `uri`). The plugin decodes them without a full
  transit dependency.
- An `error` event means the operation failed even if HTTP status was 200.
- `clone-template` and `import-binfile` put the new id(s) in the `end` event.
- `export-binfile` puts the download URI in `end`; accept a plain string, `uri`
  and `~#uri`.

## Response and id notes

- File ids and object ids are UUIDs, usually lower-case. Do not derive one from
  a name.
- `get-file-summary` on 2.18.6 returns id/name but not pages; use `get-file` or
  `get-page` when pages matter.
- `get-file` may return pointer maps on very large files; the plugin asks for
  the plain JSON form. If a new Penpot version changes that, page reads are the
  fallback.
- `fileSummary` responses may include `permissions`; the plugin ignores them.
- The root object id is `00000000-0000-0000-0000-000000000000`.
- Some template imports produce file ids that are not the progress-event ids;
  always use the id from the final `end` event.
