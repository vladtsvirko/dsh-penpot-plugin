import { describe, expect, it } from 'vitest'
import { selectBackend } from '../src/select.js'
import { createMcpBackend, DEFAULT_MCP_TOOLS } from '../src/mcp-backend.js'
import { UnsupportedOperation } from '../src/backend.js'

const toolsWith = (registered: string[]) => ({
  get: (name: string) => (registered.includes(name) ? { name } : undefined),
  invoke: async (name: string, args: Record<string, unknown>) => ({
    content: [{ type: 'text', text: JSON.stringify([{ id: 'x', name: `${name}:${String(args['query'] ?? '')}` }]) }],
  }),
})

const noTools = { get: () => undefined }

describe('backend selection', () => {
  it('prefers an MCP tool set when one is registered', () => {
    const backend = selectBackend(
      { apiUrl: 'http://h:1', token: 't' },
      { tools: toolsWith([`mcp__penpot__${DEFAULT_MCP_TOOLS.searchFiles}`]) },
    )
    expect(backend.kind).toBe('mcp')
    expect(backend.label).toBe('mcp penpot')
  })

  it('falls back to the API when no MCP tools are present', () => {
    const backend = selectBackend({ apiUrl: 'http://h:1', token: 't' }, { tools: noTools })
    expect(backend.kind).toBe('api')
    expect(backend.label).toBe('api http://h:1')
  })

  it('honours an explicit api backend even when MCP is available', () => {
    const backend = selectBackend(
      { apiUrl: 'http://h:1', token: 't', backend: 'api' },
      { tools: toolsWith([`mcp__penpot__${DEFAULT_MCP_TOOLS.searchFiles}`]) },
    )
    expect(backend.kind).toBe('api')
  })

  it('explains what is missing when nothing can work', () => {
    expect(() => selectBackend({}, { tools: noTools })).toThrow(/PENPOT_API_URL/)
    expect(() => selectBackend({ backend: 'mcp' }, { tools: noTools })).toThrow(/no mcp__penpot__\* tools/)
    expect(() => selectBackend({ backend: 'api' }, { tools: noTools })).toThrow(/apiUrl\/token are not set/)
  })
})

describe('mcp backend', () => {
  it('maps the read operations onto the server tools and unwraps text JSON', async () => {
    const backend = createMcpBackend({
      tools: toolsWith(Object.values(DEFAULT_MCP_TOOLS).map((raw) => `mcp__penpot__${raw}`)),
      serverName: 'penpot',
    })
    expect(await backend.searchFiles('checkout')).toEqual([{ id: 'x', name: `mcp__penpot__search_files:checkout` }])
  })

  it('refuses export and import instead of pretending', async () => {
    const backend = createMcpBackend({ tools: toolsWith([]), serverName: 'penpot' })
    await expect(backend.exportFile('f')).rejects.toBeInstanceOf(UnsupportedOperation)
    await expect(backend.importFile({ path: '/tmp/x' })).rejects.toBeInstanceOf(UnsupportedOperation)
  })
})
