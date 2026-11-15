import { afterEach, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, inject } from '../src/index.js'

interface RegisteredTool {
  name: string
  execute: (args: Record<string, unknown>) => Promise<unknown>
}

/** The plugin only needs ctx.tools.register; the rest of the host is irrelevant. */
function register(config: { apiUrl?: string; token?: string } = {}): Map<string, RegisteredTool> {
  const tools = new Map<string, RegisteredTool>()
  apply({ tools: { register: (tool: RegisteredTool) => tools.set(tool.name, tool) } } as never, {
    apiUrl: { get: () => config.apiUrl ?? '' },
    token: { get: () => config.token ?? '' },
  } as never)
  return tools
}

let server: Server | undefined
afterEach(async () => {
  await new Promise<void>((resolve) => {
    if (server === undefined) resolve()
    else server.close(() => resolve())
  })
  server = undefined
})

/** Start a fake Penpot RPC endpoint and return its base URL plus the calls. */
async function fakePenpot(handler: (url: string, body: string, response: import('node:http').ServerResponse) => void): Promise<{ base: string; calls: Array<{ url: string; body: string }> }> {
  const calls: Array<{ url: string; body: string }> = []
  server = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk.toString('latin1') })
    request.on('end', () => {
      calls.push({ url: request.url ?? '', body })
      handler(request.url ?? '', body, response)
    })
  })
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('no port')
  return { base: `http://127.0.0.1:${address.port}`, calls }
}

describe('plugin surface', () => {
  it('declares the tool registry it uses', () => {
    // Cordis refuses ctx.tools without this, so a profile that mounts the
    // plugin fails at load time even though every tool is defined.
    expect(inject).toContain('tools')
  })

  it('always registers the same tool surface, configured or not', () => {
    expect([...register().keys()].sort()).toEqual([
      'penpot_add_circle',
      'penpot_add_frame',
      'penpot_add_image',
      'penpot_add_interaction',
      'penpot_add_rect',
      'penpot_add_text',
      'penpot_audit',
      'penpot_clone_template',
      'penpot_comments',
      'penpot_component_instances',
      'penpot_components',
      'penpot_create_comment_thread',
      'penpot_create_file',
      'penpot_create_flow',
      'penpot_create_project',
      'penpot_delete_comment',
      'penpot_delete_shape',
      'penpot_download_asset',
      'penpot_duplicate_file',
      'penpot_export',
      'penpot_file',
      'penpot_files',
      'penpot_find',
      'penpot_frame_png',
      'penpot_frame_svg',
      'penpot_group_shapes',
      'penpot_import',
      'penpot_libraries',
      'penpot_outline',
      'penpot_pages',
      'penpot_projects',
      'penpot_prototype',
      'penpot_reply_comment',
      'penpot_resolve_comment',
      'penpot_search',
      'penpot_snapshots',
      'penpot_status',
      'penpot_teams',
      'penpot_templates',
      'penpot_tokens',
      'penpot_ungroup_shape',
      'penpot_update_comment',
      'penpot_update_shape',
      'penpot_update_text',
    ])
  })

  it('reports none without credentials and still loads', async () => {
    const status = await register().get('penpot_status')?.execute({})
    expect(status).toEqual({
      backend: 'none',
      label: 'not configured (PENPOT_API_URL / PENPOT_ACCESS_TOKEN)',
    })
  })

  it('registers the shipped Penpot skill', async () => {
    let createProvider: ((control: { signal: AbortSignal; invalidate: () => void }) => {
      list: (options: { signal?: AbortSignal }) => Promise<readonly { name: string; description: string; resourceBase?: { path?: string } }[]>
      get: (candidate: unknown, options: { signal?: AbortSignal }) => Promise<{ content: string } | undefined>
    }) | undefined
    apply({
      tools: { register: () => undefined },
      skills: { registerProvider: (create: typeof createProvider) => { createProvider = create; return () => undefined } },
    } as never, { apiUrl: { get: () => '' }, token: { get: () => '' } } as never)
    expect(createProvider).toBeTypeOf('function')
    const provider = createProvider?.({ signal: new AbortController().signal, invalidate: () => undefined })
    const candidates = await provider?.list({})
    expect(candidates?.[0]?.name).toBe('penpot')
    expect(candidates?.[0]?.description).toContain('Penpot')
    const loaded = await provider?.get(candidates?.[0], {})
    expect(loaded?.content).toContain('# Penpot')
  })

  it('throws one readable error from a data tool when unconfigured', async () => {
    await expect(register().get('penpot_teams')?.execute({})).rejects.toThrow(
      'Penpot is not configured: set the API URL and token on the Plugins page, or set PENPOT_API_URL and PENPOT_ACCESS_TOKEN',
    )
  })

  it('refuses an import with no destination before asking the backend', async () => {
    await expect(register().get('penpot_import')?.execute({ path: '/tmp/x.penpot' })).rejects.toThrow(
      'penpot_import needs a projectId for a new file, or a fileId to replace one',
    )
  })

  it('imports a .penpot file through the configured backend', async () => {
    const { base, calls } = await fakePenpot((_url, _body, response) => {
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.end('event: end\ndata: ["~u00000000-0000-0000-0000-00000000f11e"]\n\n')
    })
    const tools = register({ apiUrl: base, token: 'tok' })
    const dir = await mkdtemp(join(tmpdir(), 'penpot-tool-'))
    try {
      const file = join(dir, 'design.penpot')
      await writeFile(file, 'zipbytes')
      const result = await tools.get('penpot_import')?.execute({
        path: file,
        projectId: 'project-1',
        name: 'Imported design',
      })
      expect(result).toEqual({ id: '00000000-0000-0000-0000-00000000f11e' })
      expect(calls[0]?.url).toBe('/api/rpc/command/import-binfile')
      expect(calls[0]?.body).toContain('name="project-id"')
      expect(calls[0]?.body).toContain('name="name"')
      expect(calls[0]?.body).toContain('filename="design.penpot"')
      expect(await readFile(file, 'utf8')).toBe('zipbytes')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
