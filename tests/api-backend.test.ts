import { afterEach, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApiBackend, normalizeBase, PenpotApiError } from '../src/api-backend.js'

const calls: Array<{ url: string; auth: string; accept: string; body: string }> = []
let server: Server | undefined

const start = async (handler: (call: { url: string; auth: string; accept: string; body: string }, response: import('node:http').ServerResponse) => void): Promise<string> => {
  calls.length = 0
  server = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk.toString('latin1') })
    request.on('end', () => {
      const call = {
        url: request.url ?? '',
        auth: request.headers.authorization ?? '',
        accept: request.headers.accept ?? '',
        body,
      }
      calls.push(call)
      handler(call, response)
    })
  })
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('no port')
  return `http://127.0.0.1:${address.port}`
}

afterEach(async () => {
  await new Promise<void>((resolve) => { if (server === undefined) resolve(); else server.close(() => resolve()) })
  server = undefined
})

const json = (response: import('node:http').ServerResponse, body: unknown) => {
  response.writeHead(200, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

describe('api backend', () => {
  it('normalizes any pasted URL form', () => {
    expect(normalizeBase('http://h:8090')).toBe('http://h:8090')
    expect(normalizeBase('http://h:8090/')).toBe('http://h:8090')
    expect(normalizeBase('http://h:8090/api/rpc/')).toBe('http://h:8090')
  })

  it('sends the token, a JSON accept header and kebab-case payloads', async () => {
    const base = await start((_call, response) => json(response, []))
    const backend = createApiBackend({ apiUrl: `${base}/api/rpc`, token: 'tok' })
    await backend.listFiles('project-1')
    expect(calls[0]?.url).toBe('/api/rpc/command/get-project-files')
    expect(calls[0]?.auth).toBe('Token tok')
    expect(calls[0]?.accept).toBe('application/json')
    expect(JSON.parse(calls[0]?.body ?? '{}')).toEqual({ 'project-id': 'project-1' })
  })

  it('scopes a file search to a team', async () => {
    const base = await start((_call, response) => json(response, []))
    const backend = createApiBackend({ apiUrl: base, token: 'tok' })
    await backend.searchFiles('team-1', 'chat')
    expect(JSON.parse(calls[0]?.body ?? '{}')).toEqual({ 'team-id': 'team-1', 'search-term': 'chat' })
  })

  it('reduces list results to id and name', async () => {
    const base = await start((_call, response) => json(response, [{ id: 'a', name: 'A', extra: 1 }]))
    const backend = createApiBackend({ apiUrl: base, token: 'tok' })
    expect(await backend.listTeams()).toEqual([{ id: 'a', name: 'A' }])
  })

  it('surfaces a refusal as PenpotApiError with the status', async () => {
    const base = await start((_call, response) => {
      response.writeHead(401, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ message: 'no' }))
    })
    const backend = createApiBackend({ apiUrl: base, token: 'bad' })
    await expect(backend.listTeams()).rejects.toMatchObject({ name: 'PenpotApiError', status: 401 })
    await expect(backend.listTeams()).rejects.toBeInstanceOf(PenpotApiError)
  })

  it('reads the SSE export URL and the SSE import id', async () => {
    let downloadUrl = ''
    const base = await start((call, response) => {
      if (call.url.includes('export-binfile')) {
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        response.end([
          'event: progress',
          'data: {"~:section":"~:file"}',
          '',
          'event: end',
          `data: ${JSON.stringify(downloadUrl)}`,
          '',
        ].join('\n'))
        return
      }
      if (call.url === '/download') {
        response.writeHead(200, { 'content-type': 'application/zip' })
        response.end(Buffer.from('BINFILE'))
        return
      }
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.end([
        'event: progress',
        'data: {"~:section":"~:file"}',
        '',
        'event: end',
        'data: ["~u00000000-0000-0000-0000-000000000002"]',
        '',
      ].join('\n'))
    })
    downloadUrl = `${base}/download`
    const dir = await mkdtemp(join(tmpdir(), 'penpot-plugin-'))
    try {
      const backend = createApiBackend({ apiUrl: base, token: 'tok' })
      const bytes = await backend.exportFile('file-1')
      expect(Buffer.from(bytes).toString()).toBe('BINFILE')

      const path = join(dir, 'x.penpot')
      await writeFile(path, 'zipbytes')
      const result = await backend.importFile({ path, projectId: 'proj-1', name: 'Design' })
      expect(result.id).toBe('00000000-0000-0000-0000-000000000002')
      const upload = calls.at(-1)
      expect(upload?.body).toContain('name="project-id"')
      expect(upload?.body).toContain('name="file"; filename="x.penpot"')
      expect(await readFile(path, 'utf8')).toBe('zipbytes')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
