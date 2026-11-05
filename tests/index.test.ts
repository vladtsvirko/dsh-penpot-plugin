import { describe, expect, it } from 'vitest'
import { apply, inject } from '../src/index.js'

interface RegisteredTool {
  name: string
  execute: (args: Record<string, unknown>) => Promise<unknown>
}

/** The plugin only needs ctx.tools.register; the rest of the host is irrelevant. */
function register(config: { apiUrl?: string; token?: string } = {}): Map<string, RegisteredTool> {
  const tools = new Map<string, RegisteredTool>()
  apply({ tools: { register: (tool: RegisteredTool) => tools.set(tool.name, tool) } } as never, config)
  return tools
}

describe('plugin surface', () => {
  it('declares the tool registry it uses', () => {
    // Cordis refuses ctx.tools without this, so a profile that mounts the
    // plugin fails at load time even though every tool is defined.
    expect(inject).toContain('tools')
  })

  it('always registers the same eight tools, configured or not', () => {
    expect([...register().keys()].sort()).toEqual([
      'penpot_export',
      'penpot_file',
      'penpot_files',
      'penpot_import',
      'penpot_projects',
      'penpot_search',
      'penpot_status',
      'penpot_teams',
    ])
  })

  it('reports none without credentials and still loads', async () => {
    const status = await register().get('penpot_status')?.execute({})
    expect(status).toEqual({
      backend: 'none',
      label: 'not configured (PENPOT_API_URL / PENPOT_ACCESS_TOKEN)',
    })
  })

  it('throws one readable error from a data tool when unconfigured', async () => {
    await expect(register().get('penpot_teams')?.execute({})).rejects.toThrow(
      'Penpot is not configured: set PENPOT_API_URL and PENPOT_ACCESS_TOKEN, then restart dsh',
    )
  })

  it('refuses an import with no destination before asking the backend', async () => {
    await expect(register().get('penpot_import')?.execute({ path: '/tmp/x.penpot' })).rejects.toThrow(
      'penpot_import needs a projectId for a new file, or a fileId to replace one',
    )
  })
})
