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

export function createApiBackend(options: ApiBackendOptions): PenpotBackend {
  const base = normalizeBase(options.apiUrl)
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const headers = { authorization: `Token ${options.token}` }

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

    async searchFiles(term) {
      return asRefs(await (await rpc('search-files', { 'search-term': term })).json())
    },

    async fileSummary(fileId) {
      const raw = await (await rpc('get-file-summary', { id: fileId })).json() as Record<string, unknown>
      const pages = Array.isArray(raw['pages']) ? asRefs(raw['pages']) : undefined
      return { id: String(raw['id'] ?? fileId), name: String(raw['name'] ?? ''), ...(pages === undefined ? {} : { pages }), raw }
    },

    async exportFile(fileId) {
      const response = await rpc('export-binfile', { fileId, includeLibraries: false, embedAssets: true })
      return new Uint8Array(await response.arrayBuffer())
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
      const raw = await response.json() as Record<string, unknown>
      return { id: raw['id'] === undefined ? undefined : String(raw['id']), raw }
    },
  }
}
