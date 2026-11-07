/**
 * Direct HTTP backend: Penpot's own RPC, authenticated with an access token.
 *
 * This is a port of `design/penpot.mjs` from the dsh-tg-docker-setup CLI, kept
 * here as a typed module so the plugin has no dependency on that repository.
 *
 * @module dsh-penpot-plugin/api-backend
 */

import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import type { PenpotBackend, PenpotFileSummary, PenpotRef } from './backend.js'

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
    return value
  }
  if (Array.isArray(value)) return value.map(decodeTransit)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key.startsWith('~:') ? key.slice(2) : key, decodeTransit(item)]),
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

    async exportFile(fileId) {
      // `export-binfile` streams SSE and ends with the URL of the exported zip.
      const response = await rpc('export-binfile', {
        'file-id': fileId,
        'include-libraries': false,
        'embed-assets': true,
      })
      const events = await readSse(response)
      failOnErrorEvent(events)
      const url = lastEnd(events)
      if (typeof url !== 'string' || url.length === 0) {
        throw new PenpotApiError(response.status, 'the export finished without a download URL')
      }
      const download = await fetchImpl(url)
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
