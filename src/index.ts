/**
 * dsh-penpot — Penpot tools for a DeepSeek Harness runtime.
 *
 * The plugin is a thin shell over Penpot's HTTP RPC API: one local backend,
 * one small stable tool surface. There is deliberately no MCP path; see
 * docs/DESIGN.md.
 *
 * The tool surface is read + design analysis + safe file management + export/
 * import. Shape-level writes (Penpot's `update-file` change format) are the open
 * design question; see docs/DESIGN.md and the shipped skill.
 *
 * @module dsh-penpot-plugin
 */

import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import { createApiBackend } from './api-backend.js'
import type { PenpotBackend, PenpotPage, PenpotRef } from './backend.js'
import { auditPage, renderAudit, renderFind, renderOutline, renderPages, renderTokens } from './design.js'
import { registerPenpotSkill } from './skill.js'

export const name = 'dsh-penpot'
// `ctx.tools` and `ctx.skills` are declared services: Cordis refuses the
// properties without an injection declaration, even when the profile has the
// services mounted. This is what makes the plugin load in a plain profile; the
// skill provider registers the bundled `penpot` skill.
export const inject = ['tools', 'skills']

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

/** One text report: the model reads the rendered Markdown, not a schema tree. */
const textOutput = (description: string) => ({
  schema: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      text: { type: 'string' as const, required: true as const, description },
    },
  },
  render: (_args: unknown, value: { text: string }) => [{ type: 'text' as const, text: value.text }],
})

export function apply(ctx: Context, config: PenpotPluginConfig): void {
  registerPenpotSkill(ctx)
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
    name: 'penpot_pages',
    description: 'List the pages and top-level frames of a Penpot file, with ids, sizes and layer counts. Use it after penpot_file to choose a page or frame.',
    parameters: {
      fileId: { type: 'string', required: true, description: 'File uuid.' },
      maxFrames: { type: 'number', description: 'Maximum frames to list; default 100.' },
    },
    output: textOutput('Pages and frames, one per line.'),
    async execute(args) {
      const backend = requireBackend()
      const file = await backend.fileData(args.fileId)
      return { text: renderPages(file, Math.max(1, Math.min(1000, Math.floor(args.maxFrames ?? 100)))) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_outline',
    description: 'Print a page layer tree with bounds, fills, typography and text. Pass rootId to focus on one frame; depth and maxShapes keep the report bounded.',
    parameters: {
      fileId: { type: 'string', required: true, description: 'File uuid.' },
      pageId: { type: 'string', description: 'Page uuid from penpot_pages; defaults to the first page.' },
      rootId: { type: 'string', description: 'Shape or frame uuid to start from; requires pageId.' },
      depth: { type: 'number', description: 'Nesting levels to print; default 4, maximum 12.' },
      maxShapes: { type: 'number', description: 'Maximum shapes to print; default 300, maximum 2000.' },
      includeStyles: { type: 'boolean', description: 'Include fills, strokes, radii and typography; default true.' },
      includeText: { type: 'boolean', description: 'Include text content; default true.' },
    },
    output: textOutput('The page outline.'),
    async execute(args) {
      if (args.rootId !== undefined && args.pageId === undefined) {
        throw new Error('penpot_outline needs pageId when rootId is given')
      }
      const backend = requireBackend()
      const page = await backend.page(args.fileId, args.pageId, args.rootId)
      return { text: renderOutline(page, {
        ...(args.rootId === undefined ? {} : { rootId: args.rootId }),
        ...(args.depth === undefined ? {} : { depth: args.depth }),
        ...(args.maxShapes === undefined ? {} : { maxShapes: args.maxShapes }),
        ...(args.includeStyles === undefined ? {} : { includeStyles: args.includeStyles }),
        ...(args.includeText === undefined ? {} : { includeText: args.includeText }),
      }) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_find',
    description: 'Find layers in a Penpot page by name or text, optionally restricted to one shape type.',
    parameters: {
      fileId: { type: 'string', required: true, description: 'File uuid.' },
      pageId: { type: 'string', description: 'Page uuid from penpot_pages; defaults to the first page.' },
      query: { type: 'string', required: true, description: 'Case-insensitive text to match in layer names or text content.' },
      type: { type: 'string', description: 'Optional shape type: text, rect, circle, frame, path, group, image…' },
      limit: { type: 'number', description: 'Maximum matches; default 50.' },
    },
    output: textOutput('Matching layers with ids and locations.'),
    async execute(args) {
      const backend = requireBackend()
      const page = await backend.page(args.fileId, args.pageId)
      return { text: renderFind(page, args.query, args.type, args.limit ?? 50) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_tokens',
    description: 'Read design tokens: the file token library plus the colors, typography and radii actually used on a page. JSON is complete; CSS is ready for :root.',
    parameters: {
      fileId: { type: 'string', required: true, description: 'File uuid.' },
      pageId: { type: 'string', description: 'Page uuid for used tokens; defaults to the first page.' },
      format: { type: 'string', description: 'json (default) or css.' },
    },
    output: textOutput('Token report as JSON or CSS.'),
    async execute(args) {
      const backend = requireBackend()
      const file = await backend.fileData(args.fileId)
      const pageId = args.pageId ?? file.data.pages[0] ?? Object.keys(file.data.pagesIndex)[0]
      const page = pageId === undefined ? undefined : file.data.pagesIndex[pageId]
      if (pageId !== undefined && page === undefined) throw new Error(`page ${pageId} is not in file ${args.fileId}`)
      const format = args.format === 'css' ? 'css' : 'json'
      return { text: renderTokens(file, page, format) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_audit',
    description: 'Audit one Penpot page for WCAG contrast, text under 12px, text overflowing its box, empty frames and duplicate layer names. Read-only.',
    parameters: {
      fileId: { type: 'string', required: true, description: 'File uuid.' },
      pageId: { type: 'string', description: 'Page uuid from penpot_pages; defaults to the first page.' },
    },
    output: textOutput('Audit findings grouped by severity.'),
    async execute(args) {
      const backend = requireBackend()
      const page = await backend.page(args.fileId, args.pageId)
      return { text: renderAudit(page, auditPage(page)) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_comments',
    description: 'List comment threads on a file, or the replies in one thread. Use it to turn design feedback into work.',
    parameters: {
      fileId: { type: 'string', required: true, description: 'File uuid.' },
      threadId: { type: 'string', description: 'Thread uuid to read its replies; omit to list threads.' },
      includeResolved: { type: 'boolean', description: 'Include resolved threads when listing; default true.' },
      limit: { type: 'number', description: 'Maximum threads or replies; default 50.' },
    },
    output: textOutput('Threads or replies.'),
    async execute(args) {
      const backend = requireBackend()
      const threads = await backend.commentThreads(args.fileId)
      const limit = Math.max(1, Math.min(200, Math.floor(args.limit ?? 50)))
      const pageCache = new Map<string, PenpotPage | undefined>()
      const pageFor = async (pageId: string): Promise<PenpotPage | undefined> => {
        if (pageId.length === 0) return undefined
        if (pageCache.has(pageId)) return pageCache.get(pageId)
        let page: PenpotPage | undefined
        try { page = await backend.page(args.fileId, pageId) } catch { page = undefined }
        pageCache.set(pageId, page)
        return page
      }
      const frameName = async (pageId: string, frameId: string): Promise<string | undefined> => {
        if (frameId.length === 0) return undefined
        const page = await pageFor(pageId)
        const frame = page?.objects[frameId]
        return frame?.name
      }
      if (args.threadId !== undefined) {
        const thread = threads.find((item) => item.id === args.threadId)
        if (thread === undefined) throw new Error(`comment thread ${args.threadId} is not on file ${args.fileId}`)
        const replies = (await backend.comments(args.threadId)).slice(0, limit)
        const page = await pageFor(thread.pageId)
        const frame = page?.objects[thread.frameId]?.name
        const where = [thread.pageName ?? page?.name, frame].filter((part): part is string => part !== undefined && part.length > 0).join(' / ')
        const position = thread.position === undefined ? '' : ` (${String(thread.position.x)}, ${String(thread.position.y)})`
        const lines = [`# Thread #${String(thread.seqn)} — ${thread.isResolved ? 'resolved' : 'open'}`, `${where}${position}`]
        for (const reply of replies) {
          lines.push('')
          lines.push(`${reply.ownerFullname ?? 'Unknown'}${reply.createdAt === undefined ? '' : ` · ${reply.createdAt}`}`)
          for (const line of reply.content.split(/\r?\n/u)) lines.push(`  ${line}`)
        }
        if (replies.length === 0) lines.push('', 'No replies.')
        return { text: lines.join('\n') }
      }
      const filtered = (args.includeResolved === false ? threads.filter((thread) => !thread.isResolved) : threads)
        .slice()
        .sort((left, right) => right.seqn - left.seqn)
        .slice(0, limit)
      const lines = [`# Comments — file ${args.fileId}`, `${String(filtered.length)} thread${filtered.length === 1 ? '' : 's'}`]
      for (const thread of filtered) {
        const frame = await frameName(thread.pageId, thread.frameId)
        const where = [thread.pageName, frame].filter((part): part is string => part !== undefined && part.length > 0).join(' / ')
        const position = thread.position === undefined ? '' : ` (${String(thread.position.x)}, ${String(thread.position.y)})`
        lines.push('')
        lines.push(`#${String(thread.seqn)} ${thread.isResolved ? 'resolved' : 'open'} — ${where}${position}`)
        for (const line of thread.content.split(/\r?\n/u)) lines.push(`  ${line}`)
        lines.push(`  ${String(thread.countComments ?? 1)} comment${(thread.countComments ?? 1) === 1 ? '' : 's'}; read with threadId ${thread.id}`)
      }
      if (filtered.length === 0) lines.push('', 'No comment threads.')
      return { text: lines.join('\n') }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_snapshots',
    description: 'List a file version history, or create a named snapshot before a risky change. Creating a snapshot does not modify the design.',
    parameters: {
      fileId: { type: 'string', required: true, description: 'File uuid.' },
      create: { type: 'string', description: 'Optional label; create a snapshot with this label before listing.' },
      limit: { type: 'number', description: 'Maximum snapshots; default 50.' },
    },
    output: textOutput('Snapshot list.'),
    async execute(args) {
      const backend = requireBackend()
      const lines: string[] = []
      if (args.create !== undefined && args.create.length > 0) {
        const created = await backend.createSnapshot(args.fileId, args.create)
        lines.push(`Created snapshot ${created.id}${created.label === undefined ? '' : ` “${created.label}”`}`, '')
      }
      const snapshots = (await backend.snapshots(args.fileId))
        .slice()
        .sort((left, right) => (right.createdAt ?? '').localeCompare(left.createdAt ?? ''))
        .slice(0, Math.max(1, Math.min(200, Math.floor(args.limit ?? 50))))
      lines.push(`# Snapshots — file ${args.fileId}`, `${String(snapshots.length)} snapshot${snapshots.length === 1 ? '' : 's'}`)
      for (const snapshot of snapshots) {
        lines.push(`- ${snapshot.id}${snapshot.label === undefined ? '' : ` “${snapshot.label}”`} · revn ${String(snapshot.revn ?? '?')} · ${snapshot.createdAt ?? 'unknown date'}${snapshot.createdBy === undefined ? '' : ` · ${snapshot.createdBy}`}`)
      }
      if (snapshots.length === 0) lines.push('', 'No snapshots yet.')
      return { text: lines.join('\n') }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_libraries',
    description: 'List design-system libraries linked to a Penpot file, including transitive references.',
    parameters: {
      fileId: { type: 'string', required: true, description: 'File uuid.' },
    },
    output: textOutput('Linked libraries.'),
    async execute(args) {
      const backend = requireBackend()
      const libraries = await backend.libraries(args.fileId)
      const lines = [`# Libraries — file ${args.fileId}`]
      if (libraries.length === 0) {
        lines.push('No linked libraries.')
      } else {
        for (const library of libraries) {
          lines.push(`- ${library.id} “${library.name}”${library.projectId === undefined ? '' : ` · project ${library.projectId}`}${library.isIndirect === true ? ' · indirect' : ''}${library.syncedAt === undefined ? '' : ` · synced ${library.syncedAt}`}`)
        }
      }
      return { text: lines.join('\n') }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_templates',
    description: 'List the built-in Penpot templates available to penpot_clone_template on this deployment.',
    parameters: {},
    output: textOutput('Template ids and names.'),
    async execute() {
      const backend = requireBackend()
      const templates = await backend.templates()
      const lines = [`# Built-in templates`, `${String(templates.length)} template${templates.length === 1 ? '' : 's'}`]
      for (const template of templates) lines.push(`- ${template.id} “${template.name}”`)
      if (templates.length === 0) lines.push('', 'No templates configured.')
      return { text: lines.join('\n') }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_create_project',
    description: 'Create a Penpot project in a team. Omit teamId to use the first team the account can see.',
    parameters: {
      name: { type: 'string', required: true, description: 'Project name.' },
      teamId: { type: 'string', description: 'Team uuid from penpot_teams; defaults to the first team.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', required: true, description: 'New project uuid.' },
          name: { type: 'string', required: true, description: 'Project name.' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `created project ${value.id} “${value.name}”` }],
    },
    async execute(args) {
      const backend = requireBackend()
      const teamId = args.teamId ?? (await backend.listTeams())[0]?.id
      if (teamId === undefined || teamId.length === 0) throw new Error('no Penpot team found — create one in Penpot first')
      return await backend.createProject({ teamId, name: args.name })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_create_file',
    description: 'Create an empty Penpot file in a project. Use penpot_clone_template when you want a starter design.',
    parameters: {
      projectId: { type: 'string', required: true, description: 'Project uuid from penpot_projects.' },
      name: { type: 'string', required: true, description: 'File name.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', required: true, description: 'New file uuid.' },
          name: { type: 'string', required: true, description: 'File name.' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `created file ${value.id} “${value.name}”` }],
    },
    async execute(args) {
      const backend = requireBackend()
      return await backend.createFile({ projectId: args.projectId, name: args.name })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_duplicate_file',
    description: 'Duplicate a Penpot file in its current project. Useful as a baseline before an import or a redesign.',
    parameters: {
      fileId: { type: 'string', required: true, description: 'File uuid to duplicate.' },
      name: { type: 'string', description: 'Name for the copy; Penpot chooses one when omitted.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', required: true, description: 'New file uuid.' },
          name: { type: 'string', required: true, description: 'New file name.' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `duplicated to ${value.id} “${value.name}”` }],
    },
    async execute(args) {
      const backend = requireBackend()
      return await backend.duplicateFile({ fileId: args.fileId, ...(args.name === undefined ? {} : { name: args.name }) })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_clone_template',
    description: 'Clone a built-in Penpot template into a project. List choices with penpot_templates first.',
    parameters: {
      projectId: { type: 'string', required: true, description: 'Target project uuid.' },
      templateId: { type: 'string', required: true, description: 'Template id from penpot_templates.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          files: {
            type: 'array',
            required: true,
            description: 'Files created by the template; some templates produce several.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true, description: 'New file uuid.' },
                name: { type: 'string', required: true, description: 'File name.' },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.files.map((file) => `${file.id}\t${file.name}`).join('\n') }],
    },
    async execute(args) {
      const backend = requireBackend()
      const files = await backend.cloneTemplate({ projectId: args.projectId, templateId: args.templateId })
      return { files }
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
