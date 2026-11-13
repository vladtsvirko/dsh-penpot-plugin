/**
 * Direct HTTP backend: Penpot's own RPC, authenticated with an access token.
 *
 * @module dsh-penpot-plugin/api-backend
 */

import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import type {
  PenpotBackend,
  PenpotComment,
  PenpotCommentThread,
  PenpotFileData,
  PenpotFileSummary,
  PenpotLibrary,
  PenpotPage,
  PenpotRef,
  PenpotShape,
  PenpotSnapshot,
  PenpotTemplate,
} from './backend.js'

export interface ApiBackendOptions {
  apiUrl: string
  token: string
  /** Injectable for tests. */
  fetchImpl?: typeof fetch
}

/** Strip a trailing /api/rpc or slash so any pasted form works. */
export function normalizeBase(url: string): string {
  return url.replace(/\/+$/, '').replace(/\/api\/rpc$/, '')
}

export class PenpotApiError extends Error {
  readonly status: number
  constructor(status: number, detail: string) {
    super(`Penpot answered ${String(status)}${detail === '' ? '' : `: ${detail}`}`)
    this.name = 'PenpotApiError'
    this.status = status
  }
}

const asRefs = (value: unknown): PenpotRef[] => {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({ id: String(item['id'] ?? ''), name: String(item['name'] ?? '') }))
}

/**
 * Penpot's export/import endpoints answer as Server-Sent Events, and the event
 * data is transit-encoded even when the request asked for JSON. The only
 * markers these endpoints emit are `~:` (keyword key) and `~u` (uuid), so a
 * small normalizer is enough and avoids a transit dependency.
 */
const decodeTransit = (value: unknown): unknown => {
  if (typeof value === 'string') {
    if (value.startsWith('~u')) return value.slice(2)
    if (value.startsWith('~:')) return value.slice(2)
    if (value.startsWith('~#')) return value.slice(2)
    return value
  }
  if (Array.isArray(value)) return value.map(decodeTransit)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key.startsWith('~:') || key.startsWith('~#') ? key.slice(2) : key,
        decodeTransit(item),
      ]),
    )
  }
  return value
}

/** Read an SSE body into `{ event, data }` records, ignoring comments. */
export const readSse = async (response: Response): Promise<Array<{ event: string; data: unknown }>> => {
  const text = await response.text()
  const events: Array<{ event: string; data: unknown }> = []
  for (const block of text.split(/\r?\n\r?\n/)) {
    let event = 'message'
    const data: string[] = []
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) data.push(line.slice(5).trim())
    }
    if (data.length === 0) continue
    const raw = data.join('\n')
    let parsed: unknown = raw
    try {
      parsed = decodeTransit(JSON.parse(raw))
    } catch {
      // A non-JSON payload stays a string; the caller decides what it means.
    }
    events.push({ event, data: parsed })
  }
  return events
}

/** The payload of the last `end` event, or undefined when the stream had none. */
const lastEnd = (events: Array<{ event: string; data: unknown }>): unknown => {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.event === 'end') return events[index]?.data
  }
  return undefined
}

/**
 * The export end event is a plain URL in older Penpot builds and
 * `{"~#uri": "…"}` (decoded to `{ uri }`) in 2.18. Accept both, and the
 * undecoded key as a fallback.
 */
const exportUrl = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.length > 0) return value
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of ['uri', '~#uri']) {
      const candidate = record[key]
      if (typeof candidate === 'string' && candidate.length > 0) return candidate
    }
  }
  return undefined
}

const failOnErrorEvent = (events: Array<{ event: string; data: unknown }>): void => {
  const error = events.find((item) => item.event === 'error')
  if (error !== undefined) {
    throw new PenpotApiError(200, JSON.stringify(error.data).slice(0, 300))
  }
}

export function createApiBackend(options: ApiBackendOptions): PenpotBackend {
  const base = normalizeBase(options.apiUrl)
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const headers = { authorization: `Token ${options.token}`, accept: 'application/json' }

  const rpc = async (command: string, body: Record<string, unknown> = {}): Promise<Response> => {
    const response = await fetchImpl(`${base}/api/rpc/command/${command}`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new PenpotApiError(response.status, text.slice(0, 300).trim())
    }
    return response
  }

  const rpcJson = async <T>(command: string, body: Record<string, unknown> = {}): Promise<T> => {
    return await (await rpc(command, body)).json() as T
  }

  return {
    kind: 'api',
    label: `api ${base}`,

    async listTeams() {
      return asRefs(await (await rpc('get-teams')).json())
    },

    async listProjects(teamId) {
      const command = teamId === undefined ? 'get-all-projects' : 'get-projects'
      return asRefs(await (await rpc(command, teamId === undefined ? {} : { 'team-id': teamId })).json())
    },

    async listFiles(projectId) {
      return asRefs(await (await rpc('get-project-files', { 'project-id': projectId })).json())
    },

    async searchFiles(teamId, term) {
      return asRefs(await (await rpc('search-files', { 'team-id': teamId, 'search-term': term })).json())
    },

    async fileSummary(fileId) {
      const raw = await (await rpc('get-file-summary', { id: fileId })).json() as Record<string, unknown>
      const pages = Array.isArray(raw['pages']) ? asRefs(raw['pages']) : undefined
      return { id: String(raw['id'] ?? fileId), name: String(raw['name'] ?? ''), ...(pages === undefined ? {} : { pages }), raw }
    },

    async fileData(fileId) {
      const raw = await rpcJson<Record<string, unknown>>('get-file', { id: fileId })
      const data = (raw['data'] ?? {}) as Record<string, unknown>
      const pages = Array.isArray(data['pages']) ? data['pages'].map(String) : []
      const pagesIndex = (data['pagesIndex'] ?? {}) as Record<string, PenpotPage>
      return {
        id: String(raw['id'] ?? fileId),
        name: String(raw['name'] ?? ''),
        revn: Number(raw['revn'] ?? 0),
        vern: Number(raw['vern'] ?? 0),
        ...(typeof raw['projectId'] === 'string' ? { projectId: raw['projectId'] } : {}),
        ...(typeof raw['teamId'] === 'string' ? { teamId: raw['teamId'] } : {}),
        data: {
          pages,
          pagesIndex,
          ...(data['tokensLib'] === undefined ? {} : { tokensLib: data['tokensLib'] as Record<string, unknown> }),
          ...(data['typographies'] === undefined ? {} : { typographies: data['typographies'] as Record<string, unknown> }),
        },
      }
    },

    async page(fileId, pageId, objectId) {
      const raw = await rpcJson<Record<string, unknown>>('get-page', {
        'file-id': fileId,
        ...(pageId === undefined ? {} : { 'page-id': pageId }),
        ...(objectId === undefined ? {} : { 'object-id': objectId }),
      })
      return {
        id: String(raw['id'] ?? pageId ?? ''),
        name: String(raw['name'] ?? ''),
        objects: (raw['objects'] ?? {}) as Record<string, PenpotShape>,
      }
    },

    async commentThreads(fileId) {
      const raw = await rpcJson<Array<Record<string, unknown>>>('get-comment-threads', { 'file-id': fileId })
      return raw.map((item): PenpotCommentThread => {
        const position = item['position']
        return {
          id: String(item['id'] ?? ''),
          seqn: Number(item['seqn'] ?? 0),
          content: String(item['content'] ?? ''),
          isResolved: Boolean(item['isResolved']),
          pageId: String(item['pageId'] ?? ''),
          ...(typeof item['pageName'] === 'string' ? { pageName: item['pageName'] } : {}),
          frameId: String(item['frameId'] ?? ''),
          ...(position !== null && typeof position === 'object' && 'x' in position && 'y' in position
            ? { position: { x: Number((position as { x: unknown }).x), y: Number((position as { y: unknown }).y) } }
            : {}),
          ...(typeof item['ownerFullname'] === 'string' ? { ownerFullname: item['ownerFullname'] } : {}),
          ...(typeof item['createdAt'] === 'string' ? { createdAt: item['createdAt'] } : {}),
          ...(typeof item['modifiedAt'] === 'string' ? { modifiedAt: item['modifiedAt'] } : {}),
          ...(typeof item['countComments'] === 'number' ? { countComments: item['countComments'] } : {}),
          ...(typeof item['countUnreadComments'] === 'number' ? { countUnreadComments: item['countUnreadComments'] } : {}),
        }
      })
    },

    async comments(threadId) {
      const raw = await rpcJson<Array<Record<string, unknown>>>('get-comments', { 'thread-id': threadId })
      return raw.map((item): PenpotComment => ({
        id: String(item['id'] ?? ''),
        threadId: String(item['threadId'] ?? threadId),
        content: String(item['content'] ?? ''),
        ...(typeof item['ownerFullname'] === 'string' ? { ownerFullname: item['ownerFullname'] } : {}),
        ...(typeof item['createdAt'] === 'string' ? { createdAt: item['createdAt'] } : {}),
      }))
    },

    async snapshots(fileId) {
      const raw = await rpcJson<Array<Record<string, unknown>>>('get-file-snapshots', { 'file-id': fileId })
      return raw.map((item): PenpotSnapshot => ({
        id: String(item['id'] ?? ''),
        ...(typeof item['label'] === 'string' ? { label: item['label'] } : {}),
        ...(typeof item['revn'] === 'number' ? { revn: item['revn'] } : {}),
        ...(typeof item['createdAt'] === 'string' ? { createdAt: item['createdAt'] } : {}),
        ...(typeof item['createdBy'] === 'string' ? { createdBy: item['createdBy'] } : {}),
      }))
    },

    async createSnapshot(fileId, label) {
      const raw = await rpcJson<Record<string, unknown>>('create-file-snapshot', {
        'file-id': fileId,
        ...(label === undefined || label.length === 0 ? {} : { label }),
      })
      return {
        id: String(raw['id'] ?? ''),
        ...(typeof raw['label'] === 'string' ? { label: raw['label'] } : {}),
        ...(typeof raw['revn'] === 'number' ? { revn: raw['revn'] } : {}),
        ...(typeof raw['createdAt'] === 'string' ? { createdAt: raw['createdAt'] } : {}),
        ...(typeof raw['createdBy'] === 'string' ? { createdBy: raw['createdBy'] } : {}),
      }
    },

    async libraries(fileId) {
      const raw = await rpcJson<Array<Record<string, unknown>>>('get-file-libraries', { 'file-id': fileId })
      return raw.map((item): PenpotLibrary => ({
        id: String(item['id'] ?? ''),
        name: String(item['name'] ?? ''),
        ...(typeof item['projectId'] === 'string' ? { projectId: item['projectId'] } : {}),
        ...(typeof item['syncedAt'] === 'string' ? { syncedAt: item['syncedAt'] } : {}),
        ...(typeof item['isIndirect'] === 'boolean' ? { isIndirect: item['isIndirect'] } : {}),
      }))
    },

    async templates() {
      const raw = await rpcJson<Array<Record<string, unknown>>>('get-builtin-templates')
      return raw.map((item): PenpotTemplate => ({
        id: String(item['id'] ?? ''),
        name: String(item['name'] ?? ''),
      }))
    },

    async createProject({ teamId, name }) {
      const raw = await rpcJson<Record<string, unknown>>('create-project', { 'team-id': teamId, name })
      return { id: String(raw['id'] ?? ''), name: String(raw['name'] ?? name) }
    },

    async createFile({ projectId, name }) {
      const raw = await rpcJson<Record<string, unknown>>('create-file', { 'project-id': projectId, name })
      return { id: String(raw['id'] ?? ''), name: String(raw['name'] ?? name) }
    },

    async duplicateFile({ fileId, name }) {
      const raw = await rpcJson<Record<string, unknown>>('duplicate-file', {
        'file-id': fileId,
        ...(name === undefined || name.length === 0 ? {} : { name }),
      })
      return { id: String(raw['id'] ?? ''), name: String(raw['name'] ?? '') }
    },

    async cloneTemplate({ projectId, templateId }) {
      const response = await rpc('clone-template', { 'project-id': projectId, 'template-id': templateId })
      const events = await readSse(response)
      failOnErrorEvent(events)
      const ids = new Set<string>()
      const collectIds = (value: unknown): void => {
        if (typeof value === 'string') {
          if (value.length > 0) ids.add(value)
          return
        }
        if (Array.isArray(value)) {
          for (const item of value) collectIds(item)
          return
        }
        if (value === null || typeof value !== 'object') return
        const record = value as Record<string, unknown>
        for (const key of ['id', 'fileId', 'file-id']) collectIds(record[key])
        for (const key of ['set', 'vector', 'list', 'files']) collectIds(record[key])
      }
      collectIds(lastEnd(events))
      if (ids.size === 0) {
        throw new PenpotApiError(response.status, 'the template clone finished without a file id')
      }
      const files: PenpotRef[] = []
      for (const id of ids) {
        const summary = await this.fileSummary(id)
        files.push({ id: summary.id, name: summary.name })
      }
      return files
    },

    async exportFile(fileId) {
      // `export-binfile` streams SSE and ends with the URL of the exported zip.
      const response = await rpc('export-binfile', {
        'file-id': fileId,
        'include-libraries': false,
        'embed-assets': true,
      })
      const events = await readSse(response)
      failOnErrorEvent(events)
      const url = exportUrl(lastEnd(events))
      if (url === undefined) {
        throw new PenpotApiError(response.status, 'the export finished without a download URL')
      }
      const target = new URL(url, `${base}/`)
      // Penpot serves the export from its own /assets route, which requires the
      // token. A presigned third-party URL must not receive that token.
      const sameOrigin = target.origin === new URL(base).origin
      const download = await fetchImpl(target.toString(), sameOrigin ? { headers } : undefined)
      if (!download.ok) {
        throw new PenpotApiError(download.status, `the export download failed (${String(download.status)})`)
      }
      return new Uint8Array(await download.arrayBuffer())
    },

    async importFile({ path, projectId, fileId, name }) {
      const bytes = await readFile(path)
      const form = new FormData()
      if (name !== undefined) form.set('name', name)
      if (projectId !== undefined) form.set('project-id', projectId)
      if (fileId !== undefined) form.set('file-id', fileId)
      form.set('file', new Blob([bytes], { type: 'application/octet-stream' }), basename(path))
      const response = await fetchImpl(`${base}/api/rpc/command/import-binfile`, { method: 'POST', headers, body: form })
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new PenpotApiError(response.status, text.slice(0, 300).trim())
      }
      // The stream ends with the id(s) of the imported file(s).
      const events = await readSse(response)
      failOnErrorEvent(events)
      const result = lastEnd(events)
      const first = Array.isArray(result) ? result[0] : result
      return { id: typeof first === 'string' && first.length > 0 ? first : undefined, raw: events }
    },
  }
}
