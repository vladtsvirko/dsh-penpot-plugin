/**
 * dsh-penpot — Penpot tools for a DeepSeek Harness runtime.
 *
 * The plugin is a thin shell over Penpot's HTTP RPC API: one local backend,
 * one small stable tool surface. There is deliberately no MCP path; see
 * docs/DESIGN.md.
 *
 * The tool surface is read + export + import. Writing (Penpot's `update-file`
 * change format) is the open design question; see docs/DESIGN.md.
 *
 * @module dsh-penpot-plugin
 */

import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import { createApiBackend } from './api-backend.js'
import type { PenpotBackend, PenpotRef } from './backend.js'

export const name = 'dsh-penpot'
// `ctx.tools` is a declared service: Cordis refuses the property without an
// injection declaration, even when the profile has the service mounted. This is
// what makes the plugin load in a plain profile.
export const inject = ['tools']

export const Config: Schema<PenpotPluginConfigInput, PenpotPluginConfig> = Schema.object({
  apiUrl: Schema.string().default('').volatile(),
  token: Schema.string().default('').volatile(),
})

export interface PenpotPluginConfigInput {
  apiUrl?: string
  token?: string
}

export interface PenpotPluginConfig {
  apiUrl: Volatile<string>
  token: Volatile<string>
}

/** Render one list result: id and name per line, backend in parentheses. */
function describeRefs(value: { backend: string; items: readonly PenpotRef[] }): string {
  return value.items.length === 0
    ? `no results (${value.backend})`
    : `${value.items.map((item) => `${item.id}\t${item.name}`).join('\n')}\n(${value.backend})`
}

export function apply(ctx: Context, config: PenpotPluginConfig): void {
  // Volatile fields update in place when the Plugins page saves them, so every
  // tool call resolves the backend from the current values.
  const currentBackend = (): PenpotBackend | undefined => {
    const apiUrl = config.apiUrl.get()
    const token = config.token.get()
    return apiUrl.length > 0 && token.length > 0
      ? createApiBackend({ apiUrl, token })
      : undefined
  }
  const requireBackend = (): PenpotBackend => {
    const backend = currentBackend()
    if (backend === undefined) {
      throw new Error('Penpot is not configured: set the API URL and token on the Plugins page, or set PENPOT_API_URL and PENPOT_ACCESS_TOKEN')
    }
    return backend
  }

  ctx.tools.register(defineTool({
    name: 'penpot_status',
    description: 'Report whether the Penpot HTTP API is configured. Call it when a Penpot tool fails.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          backend: { type: 'string', required: true, description: 'api, or none when not configured.' },
          label: { type: 'string', required: true, description: 'Human-readable endpoint, e.g. "api http://host:8090".' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `${value.backend} — ${value.label}` }],
    },
    async execute() {
      const backend = currentBackend()
      return backend === undefined
        ? { backend: 'none', label: 'not configured (PENPOT_API_URL / PENPOT_ACCESS_TOKEN)' }
        : { backend: backend.kind, label: backend.label }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_teams',
    description: 'List the Penpot teams the configured account can see. Start here when you do not know any ids.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          backend: { type: 'string', required: true, description: 'Which backend answered: api.' },
          items: {
            type: 'array',
            required: true,
            description: 'Penpot objects, id and name only.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true, description: 'Penpot uuid.' },
                name: { type: 'string', required: true, description: 'Display name.' },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: describeRefs(value) }],
    },
    async execute() {
      const backend = requireBackend()
      return { backend: backend.kind, items: await backend.listTeams() }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_projects',
    description: 'List Penpot projects, optionally restricted to one team.',
    parameters: {
      teamId: { type: 'string', description: 'Team uuid from penpot_teams. Omit for every project the account can see.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          backend: { type: 'string', required: true, description: 'Which backend answered: api.' },
          items: {
            type: 'array',
            required: true,
            description: 'Penpot objects, id and name only.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true, description: 'Penpot uuid.' },
                name: { type: 'string', required: true, description: 'Display name.' },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: describeRefs(value) }],
    },
    async execute(args) {
      const backend = requireBackend()
      return { backend: backend.kind, items: await backend.listProjects(args.teamId) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_files',
    description: 'List the design files in a Penpot project.',
    parameters: {
      projectId: { type: 'string', required: true, description: 'Project uuid from penpot_projects.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          backend: { type: 'string', required: true, description: 'Which backend answered: api.' },
          items: {
            type: 'array',
            required: true,
            description: 'Penpot objects, id and name only.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true, description: 'Penpot uuid.' },
                name: { type: 'string', required: true, description: 'Display name.' },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: describeRefs(value) }],
    },
    async execute(args) {
      const backend = requireBackend()
      return { backend: backend.kind, items: await backend.listFiles(args.projectId) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_search',
    description: 'Search Penpot design files by name or content term. Penpot searches within one team, so pass teamId or let the first team be used.',
    parameters: {
      query: { type: 'string', required: true, description: 'Search term.' },
      teamId: { type: 'string', description: 'Team uuid from penpot_teams; defaults to the first team.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          backend: { type: 'string', required: true, description: 'Which backend answered: api.' },
          items: {
            type: 'array',
            required: true,
            description: 'Penpot objects, id and name only.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true, description: 'Penpot uuid.' },
                name: { type: 'string', required: true, description: 'Display name.' },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: describeRefs(value) }],
    },
    async execute(args) {
      const backend = requireBackend()
      const teamId = args.teamId ?? (await backend.listTeams())[0]?.id
      if (teamId === undefined || teamId.length === 0) {
        throw new Error('no Penpot team found — create one in Penpot before searching')
      }
      return { backend: backend.kind, items: await backend.searchFiles(teamId, args.query) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_file',
    description: 'Show one design file: its id and name.',
    parameters: {
      fileId: { type: 'string', required: true, description: 'File uuid from penpot_files or penpot_search.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          backend: { type: 'string', required: true, description: 'api, or none when not configured.' },
          file: {
            type: 'object',
            required: true,
            additionalProperties: false,
            properties: {
              id: { type: 'string', required: true, description: 'File uuid.' },
              name: { type: 'string', required: true, description: 'File name.' },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `${value.file.id}\t${value.file.name} (${value.backend})` }],
    },
    async execute(args) {
      const backend = requireBackend()
      const summary = await backend.fileSummary(args.fileId)
      return { backend: backend.kind, file: { id: summary.id, name: summary.name } }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_export',
    description: 'Export a design file to a .penpot file on disk (a zip of Penpot JSON). Read it with the normal file tools, then import it back with penpot_import.',
    parameters: {
      fileId: { type: 'string', required: true, description: 'File uuid.' },
      path: { type: 'string', required: true, description: 'Absolute path to write.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true, description: 'Where the file was written.' },
          bytes: { type: 'number', required: true, description: 'Size in bytes.' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `${value.path} (${String(value.bytes)} bytes)` }],
    },
    async execute(args) {
      const backend = requireBackend()
      const bytes = await backend.exportFile(args.fileId)
      const { writeFile } = await import('node:fs/promises')
      await writeFile(args.path, bytes)
      return { path: args.path, bytes: bytes.byteLength }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_import',
    description: 'Import a .penpot file (a zip of Penpot JSON) as a new file in a project, or replace an existing file. Use penpot_export to produce the input.',
    parameters: {
      path: { type: 'string', required: true, description: 'Absolute path of the .penpot file to upload.' },
      projectId: { type: 'string', description: 'Target project uuid from penpot_projects. Required unless fileId is given.' },
      fileId: { type: 'string', description: 'Existing file uuid to replace. Omit to create a new file.' },
      name: { type: 'string', description: 'Display name for a new file. Ignored when fileId is given.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', required: true, description: 'Penpot uuid of the imported file.' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `imported ${value.id}` }],
    },
    async execute(args) {
      if ((args.projectId === undefined || args.projectId.length === 0)
        && (args.fileId === undefined || args.fileId.length === 0)) {
        throw new Error('penpot_import needs a projectId for a new file, or a fileId to replace one')
      }
      const backend = requireBackend()
      const result = await backend.importFile({
        path: args.path,
        ...(args.projectId === undefined ? {} : { projectId: args.projectId }),
        ...(args.fileId === undefined ? {} : { fileId: args.fileId }),
        ...(args.name === undefined ? {} : { name: args.name }),
      })
      // Penpot's import answers the new file id. A backend that cannot report
      // one has still done the import, so name what is known rather than lie.
      return { id: result.id ?? 'unknown (Penpot did not return a file id)' }
    },
  }))
}
