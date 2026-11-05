/**
 * dsh-penpot — Penpot tools for a DeepSeek Harness runtime.
 *
 * The plugin is a thin shell over Penpot's HTTP RPC API: one local backend,
 * one small stable tool surface. There is deliberately no MCP path; see
 * docs/DESIGN.md in the setup repository.
 *
 * v0.1 is read + export. Writing (Penpot's `update-file` change format) is the
 * open design question; see docs/DESIGN.md.
 *
 * @module dsh-penpot-plugin
 */

import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import { createApiBackend } from './api-backend.js'
import type { PenpotBackend, PenpotRef } from './backend.js'

export const name = 'dsh-penpot'

export const Config = Schema.object({
  apiUrl: Schema.string().default(''),
  token: Schema.string().default(''),
})

export interface PenpotPluginConfig {
  apiUrl?: string
  token?: string
}

/** Render one list result: id and name per line, backend in parentheses. */
function describeRefs(value: { backend: string; items: readonly PenpotRef[] }): string {
  return value.items.length === 0
    ? `no results (${value.backend})`
    : `${value.items.map((item) => `${item.id}\t${item.name}`).join('\n')}\n(${value.backend})`
}

export function apply(ctx: Context, config: PenpotPluginConfig): void {
  const configured = typeof config.apiUrl === 'string' && config.apiUrl.length > 0
    && typeof config.token === 'string' && config.token.length > 0
  const backend: PenpotBackend | undefined = configured
    ? createApiBackend({ apiUrl: config.apiUrl as string, token: config.token as string })
    : undefined
  const requireBackend = (): PenpotBackend => {
    if (backend === undefined) {
      throw new Error('Penpot is not configured: set PENPOT_API_URL and PENPOT_ACCESS_TOKEN, then restart dsh')
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
      return backend === undefined
        ? { backend: 'none', label: 'not configured (PENPOT_API_URL / PENPOT_ACCESS_TOKEN)' }
        : { backend: requireBackend().kind, label: requireBackend().label }
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
      return { backend: requireBackend().kind, items: await requireBackend().listTeams() }
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
      return { backend: requireBackend().kind, items: await requireBackend().listProjects(args.teamId) }
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
      return { backend: requireBackend().kind, items: await requireBackend().listFiles(args.projectId) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_search',
    description: 'Search Penpot design files by name or content term.',
    parameters: {
      query: { type: 'string', required: true, description: 'Search term.' },
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
      return { backend: requireBackend().kind, items: await requireBackend().searchFiles(args.query) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_file',
    description: 'Show one design file: its id, name and pages. Use it to find the page ids an export or a future write needs.',
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
      const summary = await requireBackend().fileSummary(args.fileId)
      return { backend: requireBackend().kind, file: { id: summary.id, name: summary.name } }
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
      const bytes = await requireBackend().exportFile(args.fileId)
      const { writeFile } = await import('node:fs/promises')
      await writeFile(args.path, bytes)
      return { path: args.path, bytes: bytes.byteLength }
    },
  }))
}
