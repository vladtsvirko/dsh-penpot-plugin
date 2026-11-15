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

import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import { createApiBackend } from './api-backend.js'
import type { PenpotBackend, PenpotFileData, PenpotPage, PenpotRef, PenpotShape } from './backend.js'
import { auditPage, childrenOf, renderAudit, renderFind, renderOutline, renderPages, renderTokens, shapeText } from './design.js'
import { renderSvgToPng } from './preview.js'
import { renderFrameSvg } from './render.js'
import { createCircle, createFrame, createGroup, createImage, createRect, createText, ROOT_ID, updateTextShape } from './shapes.js'
import type { TextStyle } from './shapes.js'
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
  // Optional Chrome/Chromium/Edge executable used by penpot_frame_png. The SVG
  // tool works without it; the plugin never bundles a browser.
  browserPath: Schema.string().default('').volatile(),
})

export interface PenpotPluginConfigInput {
  apiUrl?: string
  token?: string
  browserPath?: string
}

export interface PenpotPluginConfig {
  apiUrl: Volatile<string>
  token: Volatile<string>
  browserPath: Volatile<string>
}

/** Render one list result: id and name per line, backend in parentheses. */
function describeRefs(value: { backend: string; items: readonly PenpotRef[] }): string {
  return value.items.length === 0
    ? `no results (${value.backend})`
    : `${value.items.map((item) => `${item.id}\t${item.name}`).join('\n')}\n(${value.backend})`
}

/** One text report: the model reads the rendered Markdown, not a schema tree. */
const idOutput = (label: string) => ({
  schema: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      id: { type: 'string' as const, required: true as const, description: 'Penpot uuid of the affected object.' },
    },
  },
  render: (_args: unknown, value: { id: string }) => [{ type: 'text' as const, text: `${label} ${value.id}` }],
})

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

  const pageOf = (file: PenpotFileData, pageId: string | undefined): PenpotPage => {
    const id = pageId ?? file.data.pages[0] ?? Object.keys(file.data.pagesIndex)[0]
    const page = id === undefined ? undefined : file.data.pagesIndex[id]
    if (id === undefined || page === undefined) throw new Error(`page ${id ?? '(default)'} is not in file ${file.id}`)
    return page
  }

  const locateShape = (file: PenpotFileData, shapeId: string): { page: PenpotPage; shape: PenpotShape } | undefined => {
    for (const page of Object.values(file.data.pagesIndex)) {
      const shape = page.objects[shapeId]
      if (shape !== undefined) return { page, shape }
    }
    return undefined
  }

  const addShape = async (
    backend: PenpotBackend,
    file: PenpotFileData,
    page: PenpotPage,
    shape: PenpotShape,
    parentId: string,
    index?: number,
  ): Promise<string> => {
    const parent = page.objects[parentId]
    if (parent === undefined) throw new Error(`parent ${parentId} is not in page ${page.id}`)
    const length = Array.isArray(parent.shapes) ? parent.shapes.length : 0
    const at = index === undefined ? length : Math.max(0, Math.min(length, Math.floor(index)))
    await backend.updateFile({
      fileId: file.id,
      revn: file.revn,
      vern: file.vern,
      changes: [{
        type: 'add-obj',
        id: shape.id,
        'page-id': page.id,
        'frame-id': shape.frameId ?? parentId,
        'parent-id': parentId,
        index: at,
        obj: shape,
      }],
    })
    return shape.id
  }

  const textStyleFrom = (args: {
    fontFamily?: string
    fontSize?: number
    fontWeight?: number
    lineHeight?: number
    letterSpacing?: number
    color?: string
    align?: string
  }): TextStyle => {
    const align = args.align
    if (align !== undefined && !['left', 'right', 'center', 'justify'].includes(align)) {
      throw new Error('align must be left, right, center or justify')
    }
    return {
      ...(args.fontFamily === undefined ? {} : { fontFamily: args.fontFamily }),
      ...(args.fontSize === undefined ? {} : { fontSize: args.fontSize }),
      ...(args.fontWeight === undefined ? {} : { fontWeight: args.fontWeight }),
      ...(args.lineHeight === undefined ? {} : { lineHeight: args.lineHeight }),
      ...(args.letterSpacing === undefined ? {} : { letterSpacing: args.letterSpacing }),
      ...(args.color === undefined ? {} : { color: args.color }),
      ...(align === undefined ? {} : { textAlign: align as TextStyle['textAlign'] }),
    }
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
    name: 'penpot_prototype',
    description: 'Read prototype flows and shape interactions, optionally for one page.',
    parameters: {
      fileId: { type: 'string', required: true, description: 'File uuid.' },
      pageId: { type: 'string', description: 'Page uuid; defaults to every page.' },
    },
    output: textOutput('Flows and interactions.'),
    async execute(args) {
      const backend = requireBackend()
      const file = await backend.fileData(args.fileId)
      const pages = args.pageId === undefined
        ? Object.values(file.data.pagesIndex)
        : [pageOf(file, args.pageId)]
      const lines = [`# Prototype — file ${args.fileId}`]
      for (const page of pages) {
        const flows = Object.entries(page.flows ?? {})
        const interactions: Array<{ shape: PenpotShape; interaction: Record<string, unknown> }> = []
        for (const shape of Object.values(page.objects)) {
          if (!Array.isArray(shape['interactions'])) continue
          for (const interaction of shape['interactions'] as unknown[]) {
            if (interaction !== null && typeof interaction === 'object') interactions.push({ shape, interaction: interaction as Record<string, unknown> })
          }
        }
        if (flows.length === 0 && interactions.length === 0) continue
        lines.push('', `Page ${page.name} (${page.id})`)
        for (const [id, flow] of flows) {
          const startingFrame = String(flow['startingFrame'] ?? flow['starting-frame'] ?? '')
          const frame = page.objects[startingFrame]
          lines.push(`- flow ${id} “${String(flow['name'] ?? '')}” → ${frame?.name ?? startingFrame} (${startingFrame})`)
        }
        for (const { shape, interaction } of interactions) {
          const event = String(interaction['event-type'] ?? interaction['eventType'] ?? '?')
          const action = String(interaction['action-type'] ?? interaction['actionType'] ?? '?')
          const destination = String(interaction['destination'] ?? '')
          const url = String(interaction['url'] ?? '')
          lines.push(`- interaction ${shape.id} “${shape.name}” · ${event} → ${action}${destination.length === 0 ? '' : ` ${destination}`}${url.length === 0 ? '' : ` ${url}`}`)
        }
      }
      if (lines.length === 1) lines.push('', 'No flows or interactions.')
      return { text: lines.join('\n') }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_create_flow',
    description: 'Create a prototype flow starting at a frame.',
    parameters: {
      fileId: { type: 'string', required: true, description: 'File uuid.' },
      pageId: { type: 'string', description: 'Page uuid; defaults to the first page.' },
      startingFrameId: { type: 'string', required: true, description: 'Frame uuid where the flow starts.' },
      name: { type: 'string', description: 'Flow name; default "Flow".' },
    },
    output: idOutput('created flow'),
    async execute(args) {
      const backend = requireBackend()
      const file = await backend.fileData(args.fileId)
      const page = pageOf(file, args.pageId)
      const frame = page.objects[args.startingFrameId]
      if (frame === undefined || frame.type !== 'frame') throw new Error(`frame ${args.startingFrameId} is not on page ${page.id}`)
      const id = randomUUID()
      await backend.updateFile({
        fileId: file.id,
        revn: file.revn,
        vern: file.vern,
        changes: [{
          type: 'set-flow',
          'page-id': page.id,
          id,
          params: { id, name: args.name ?? 'Flow', 'starting-frame': args.startingFrameId },
        }],
      })
      return { id }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_add_interaction',
    description: 'Append a prototype interaction to a shape. Supports navigate, open-overlay, close-overlay, prev-screen and open-url.',
    parameters: {
      fileId: { type: 'string', required: true, description: 'File uuid.' },
      shapeId: { type: 'string', required: true, description: 'Trigger shape uuid.' },
      eventType: { type: 'string', required: true, description: 'click, mouse-press, mouse-over, mouse-enter, mouse-leave or after-delay.' },
      actionType: { type: 'string', required: true, description: 'navigate, open-overlay, close-overlay, prev-screen or open-url.' },
      destination: { type: 'string', description: 'Destination frame uuid for navigate/open-overlay.' },
      url: { type: 'string', description: 'URL for open-url.' },
    },
    output: idOutput('added interaction to'),
    async execute(args) {
      const backend = requireBackend()
      const file = await backend.fileData(args.fileId)
      const found = locateShape(file, args.shapeId)
      if (found === undefined) throw new Error(`shape ${args.shapeId} is not in file ${args.fileId}`)
      const events = ['click', 'mouse-press', 'mouse-over', 'mouse-enter', 'mouse-leave', 'after-delay']
      const actions = ['navigate', 'open-overlay', 'close-overlay', 'prev-screen', 'open-url']
      if (!events.includes(args.eventType)) throw new Error(`eventType must be one of ${events.join(', ')}`)
      if (!actions.includes(args.actionType)) throw new Error(`actionType must be one of ${actions.join(', ')}`)
      if ((args.actionType === 'navigate' || args.actionType === 'open-overlay') && args.destination === undefined) {
        throw new Error(`${args.actionType} needs destination`)
      }
      if (args.actionType === 'open-url' && args.url === undefined) throw new Error('open-url needs url')
      if (args.destination !== undefined && found.page.objects[args.destination] === undefined) {
        throw new Error(`destination ${args.destination} is not on page ${found.page.id}`)
      }
      const interactions = Array.isArray(found.shape['interactions']) ? found.shape['interactions'] : []
      const next = [...interactions, {
        'event-type': args.eventType,
        'action-type': args.actionType,
        ...(args.destination === undefined ? {} : { destination: args.destination }),
        ...(args.url === undefined ? {} : { url: args.url }),
      }]
      await backend.updateFile({
        fileId: file.id,
        revn: file.revn,
        vern: file.vern,
        changes: [{
          type: 'mod-obj',
          id: found.shape.id,
          'page-id': found.page.id,
          operations: [{ type: 'assign', value: { interactions: next } }],
        }],
      })
      return { id: found.shape.id }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_components',
    description: 'List the components in a file, or inspect one component\'s layer tree. Components are read-only in this release.',
    parameters: {
      fileId: { type: 'string', required: true, description: 'File uuid.' },
      componentId: { type: 'string', description: 'Optional component uuid to inspect its objects.' },
      query: { type: 'string', description: 'Optional case-insensitive name/path filter.' },
      limit: { type: 'number', description: 'Maximum components to list; default 100.' },
    },
    output: textOutput('Components or one component outline.'),
    async execute(args) {
      const backend = requireBackend()
      const file = await backend.fileData(args.fileId)
      const components = file.data.components ?? {}
      if (args.componentId !== undefined) {
        const component = components[args.componentId]
        if (component === undefined) throw new Error(`component ${args.componentId} is not in file ${args.fileId}`)
        const objects = (component['objects'] ?? {}) as Record<string, PenpotShape>
        const mainPageId = typeof component['mainInstancePage'] === 'string' ? component['mainInstancePage'] : undefined
        const mainInstanceId = typeof component['mainInstanceId'] === 'string' ? component['mainInstanceId'] : undefined
        const mainPage = mainPageId === undefined ? undefined : file.data.pagesIndex[mainPageId]
        if (Object.keys(objects).length > 0) {
          const page: PenpotPage = { id: args.componentId, name: String(component['name'] ?? 'Component'), objects }
          return { text: `Component ${String(component['name'] ?? '')} (${args.componentId})\n${renderOutline(page, { depth: 5, maxShapes: 300 })}` }
        }
        if (mainPage !== undefined && mainInstanceId !== undefined && mainPage.objects[mainInstanceId] !== undefined) {
          return { text: `Component ${String(component['name'] ?? '')} (${args.componentId})\n${renderOutline(mainPage, { rootId: mainInstanceId, depth: 5, maxShapes: 300 })}` }
        }
        return { text: `Component ${String(component['name'] ?? '')} (${args.componentId})\nNo object data exposed; main instance ${mainInstanceId ?? '?'} on page ${mainPageId ?? '?'}.` }
      }
      const query = (args.query ?? '').trim().toLowerCase()
      const entries = Object.entries(components).filter(([, component]) => query.length === 0
        || String(component['name'] ?? '').toLowerCase().includes(query)
        || String(component['path'] ?? '').toLowerCase().includes(query))
      const shown = entries.slice(0, Math.max(1, Math.min(500, Math.floor(args.limit ?? 100))))
      const lines = [`# Components — file ${args.fileId}`, `${String(shown.length)} of ${String(entries.length)} component${entries.length === 1 ? '' : 's'}${query.length === 0 ? '' : ` matching “${args.query ?? ''}”`}`]
      for (const [id, component] of shown) {
        const objectCount = Object.keys((component['objects'] ?? {}) as Record<string, unknown>).length
        lines.push(`- ${id} “${String(component['name'] ?? '')}”${typeof component['path'] === 'string' && component['path'].length > 0 ? ` · ${component['path']}` : ''} · main ${String(component['mainInstanceId'] ?? '?')} · ${String(objectCount)} object${objectCount === 1 ? '' : 's'}`)
      }
      if (entries.length === 0) lines.push('', 'No components in this file.')
      else if (entries.length > shown.length) lines.push('', `… ${String(entries.length - shown.length)} more; raise limit or add query.`)
      return { text: lines.join('\n') }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_component_instances',
    description: 'List shapes that are instances of a component, across the file\'s pages.',
    parameters: {
      fileId: { type: 'string', required: true, description: 'File uuid.' },
      componentId: { type: 'string', description: 'Optional component uuid; omit for every instance.' },
      limit: { type: 'number', description: 'Maximum instances to list; default 100.' },
    },
    output: textOutput('Component instances.'),
    async execute(args) {
      const backend = requireBackend()
      const file = await backend.fileData(args.fileId)
      const lines = [`# Component instances — file ${args.fileId}`]
      const limit = Math.max(1, Math.min(500, Math.floor(args.limit ?? 100)))
      let count = 0
      let shown = 0
      for (const page of Object.values(file.data.pagesIndex)) {
        for (const shape of Object.values(page.objects)) {
          const componentId = typeof shape['componentId'] === 'string' ? shape['componentId'] : undefined
          if (componentId === undefined || (args.componentId !== undefined && componentId !== args.componentId)) continue
          count += 1
          if (shown >= limit) continue
          shown += 1
          const frame = shape.frameId === undefined ? undefined : page.objects[shape.frameId]?.name
          lines.push(`- ${shape.id} “${shape.name}” · component ${componentId}${frame === undefined ? '' : ` · frame ${frame}`}`)
        }
      }
      lines.push(`${String(count)} instance${count === 1 ? '' : 's'}${count > shown ? `; showing ${String(shown)}` : ''}`)
      return { text: lines.join('\n') }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_add_frame',
    description: 'Create a top-level frame (artboard) on a page. x/y are page coordinates; returns the new frame id. Use penpot_add_rect/text with this id for children.',
    parameters: {
      fileId: { type: 'string', required: true, description: 'File uuid.' },
      pageId: { type: 'string', description: 'Page uuid; defaults to the first page.' },
      name: { type: 'string', description: 'Frame name; default "Frame".' },
      x: { type: 'number', required: true, description: 'Page x coordinate.' },
      y: { type: 'number', required: true, description: 'Page y coordinate.' },
      width: { type: 'number', required: true, description: 'Frame width.' },
      height: { type: 'number', required: true, description: 'Frame height.' },
      fill: { type: 'string', description: 'Background color, e.g. #FFFFFF.' },
      radius: { type: 'number', description: 'Corner radius.' },
      opacity: { type: 'number', description: '0…1; omit for 1.' },
      index: { type: 'number', description: 'Insertion index among top-level frames; defaults to the end.' },
    },
    output: idOutput('created frame'),
    async execute(args) {
      const backend = requireBackend()
      const file = await backend.fileData(args.fileId)
      const page = pageOf(file, args.pageId)
      const id = randomUUID()
      const shape = createFrame({
        id,
        name: args.name ?? 'Frame',
        pageId: page.id,
        x: args.x,
        y: args.y,
        width: args.width,
        height: args.height,
        ...(args.fill === undefined ? {} : { fill: args.fill }),
        ...(args.radius === undefined ? {} : { radius: args.radius }),
        ...(args.opacity === undefined ? {} : { opacity: args.opacity }),
      })
      await addShape(backend, file, page, shape, ROOT_ID, args.index)
      return { id }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_add_rect',
    description: 'Add a rectangle inside a frame. x/y are absolute page coordinates; add the frame\'s x/y to the intended local position.',
    parameters: {
      fileId: { type: 'string', required: true, description: 'File uuid.' },
      frameId: { type: 'string', required: true, description: 'Containing frame uuid from penpot_pages.' },
      pageId: { type: 'string', description: 'Page uuid; defaults to the first page.' },
      name: { type: 'string', description: 'Layer name; default "Rect".' },
      x: { type: 'number', required: true, description: 'Page x coordinate.' },
      y: { type: 'number', required: true, description: 'Page y coordinate.' },
      width: { type: 'number', required: true, description: 'Width.' },
      height: { type: 'number', required: true, description: 'Height.' },
      fill: { type: 'string', description: 'Fill color; default #E5E7EB.' },
      radius: { type: 'number', description: 'Corner radius.' },
      opacity: { type: 'number', description: '0…1; omit for 1.' },
      index: { type: 'number', description: 'Insertion index in the frame; defaults to the end (top).' },
    },
    output: idOutput('created rectangle'),
    async execute(args) {
      const backend = requireBackend()
      const file = await backend.fileData(args.fileId)
      const page = pageOf(file, args.pageId)
      const frame = page.objects[args.frameId]
      if (frame === undefined || frame.type !== 'frame') throw new Error(`frame ${args.frameId} is not on page ${page.id}`)
      const id = randomUUID()
      const shape = createRect({
        id,
        name: args.name ?? 'Rect',
        pageId: page.id,
        frameId: args.frameId,
        x: args.x,
        y: args.y,
        width: args.width,
        height: args.height,
        ...(args.fill === undefined ? {} : { fill: args.fill }),
        ...(args.radius === undefined ? {} : { radius: args.radius }),
        ...(args.opacity === undefined ? {} : { opacity: args.opacity }),
      })
      await addShape(backend, file, page, shape, args.frameId, args.index)
      return { id }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_add_circle',
    description: 'Add a circle or ellipse inside a frame. x/y are absolute page coordinates; returns the new shape id.',
    parameters: {
      fileId: { type: 'string', required: true, description: 'File uuid.' },
      frameId: { type: 'string', required: true, description: 'Containing frame uuid from penpot_pages.' },
      pageId: { type: 'string', description: 'Page uuid; defaults to the first page.' },
      name: { type: 'string', description: 'Layer name; default "Circle".' },
      x: { type: 'number', required: true, description: 'Page x coordinate.' },
      y: { type: 'number', required: true, description: 'Page y coordinate.' },
      width: { type: 'number', required: true, description: 'Width.' },
      height: { type: 'number', required: true, description: 'Height.' },
      fill: { type: 'string', description: 'Fill color; default #E5E7EB.' },
      opacity: { type: 'number', description: '0…1; omit for 1.' },
      index: { type: 'number', description: 'Insertion index in the frame; defaults to the end (top).' },
    },
    output: idOutput('created circle'),
    async execute(args) {
      const backend = requireBackend()
      const file = await backend.fileData(args.fileId)
      const page = pageOf(file, args.pageId)
      const frame = page.objects[args.frameId]
      if (frame === undefined || frame.type !== 'frame') throw new Error(`frame ${args.frameId} is not on page ${page.id}`)
      const id = randomUUID()
      const shape = createCircle({
        id,
        name: args.name ?? 'Circle',
        pageId: page.id,
        frameId: args.frameId,
        x: args.x,
        y: args.y,
        width: args.width,
        height: args.height,
        ...(args.fill === undefined ? {} : { fill: args.fill }),
        ...(args.opacity === undefined ? {} : { opacity: args.opacity }),
      })
      await addShape(backend, file, page, shape, args.frameId, args.index)
      return { id }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_group_shapes',
    description: 'Group two or more sibling shapes from the same frame. Children keep page coordinates; the group gets their union bounds.',
    parameters: {
      fileId: { type: 'string', required: true, description: 'File uuid.' },
      shapeIds: { type: 'array', required: true, description: 'Shape uuids to group; all must share one frame.', items: { type: 'string' } },
      name: { type: 'string', description: 'Group name; default "Group".' },
      pageId: { type: 'string', description: 'Page uuid; defaults to the first page.' },
      index: { type: 'number', description: 'Insertion index in the frame; defaults to the lowest selected index.' },
    },
    output: idOutput('created group'),
    async execute(args) {
      if (args.shapeIds.length < 2) throw new Error('penpot_group_shapes needs at least two shape ids')
      const backend = requireBackend()
      const file = await backend.fileData(args.fileId)
      const page = pageOf(file, args.pageId)
      const selected = args.shapeIds.map((id) => page.objects[id])
      if (selected.some((shape) => shape === undefined)) throw new Error('one or more shapes are not on the selected page')
      const shapes = selected as PenpotShape[]
      if (shapes.some((shape) => shape.id === ROOT_ID)) throw new Error('the page root cannot be grouped')
      const frameId = shapes[0]?.frameId
      if (frameId === undefined || shapes.some((shape) => shape.frameId !== frameId || shape.parentId !== frameId)) {
        throw new Error('grouped shapes must be direct children of the same frame')
      }
      const frame = page.objects[frameId]
      if (frame === undefined || frame.type !== 'frame') throw new Error(`frame ${frameId} is not on page ${page.id}`)
      const frameOrder = Array.isArray(frame.shapes) ? frame.shapes : []
      const orderedIds = frameOrder.filter((id) => args.shapeIds.includes(id))
      const indexes = orderedIds.map((id) => frameOrder.indexOf(id)).filter((index) => index >= 0)
      const index = args.index ?? (indexes.length === 0 ? frameOrder.length : Math.min(...indexes))
      const minX = Math.min(...shapes.map((shape) => shape.x))
      const minY = Math.min(...shapes.map((shape) => shape.y))
      const maxX = Math.max(...shapes.map((shape) => shape.x + shape.width))
      const maxY = Math.max(...shapes.map((shape) => shape.y + shape.height))
      const id = randomUUID()
      const group = createGroup({
        id,
        name: args.name ?? 'Group',
        pageId: page.id,
        frameId,
        childIds: orderedIds,
        bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
      })
      const remaining = frameOrder.filter((shapeId) => !orderedIds.includes(shapeId))
      const nextFrameShapes = [...remaining.slice(0, index), id, ...remaining.slice(index)]
      await backend.updateFile({
        fileId: file.id,
        revn: file.revn,
        vern: file.vern,
        changes: [
          { type: 'add-obj', id, 'page-id': page.id, 'frame-id': frameId, 'parent-id': frameId, index, obj: group },
          { type: 'mod-obj', id: frameId, 'page-id': page.id, operations: [{ type: 'assign', value: { shapes: nextFrameShapes } }] },
          ...orderedIds.map((shapeId) => ({
            type: 'mod-obj',
            id: shapeId,
            'page-id': page.id,
            operations: [{ type: 'assign', value: { parentId: id, frameId } }],
          })),
        ],
      })
      return { id }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_ungroup_shape',
    description: 'Move a group\'s children back to its frame and delete the group.',
    parameters: {
      fileId: { type: 'string', required: true, description: 'File uuid.' },
      shapeId: { type: 'string', required: true, description: 'Group uuid.' },
    },
    output: idOutput('ungrouped'),
    async execute(args) {
      const backend = requireBackend()
      const file = await backend.fileData(args.fileId)
      const found = locateShape(file, args.shapeId)
      if (found === undefined) throw new Error(`shape ${args.shapeId} is not in file ${args.fileId}`)
      if (found.shape.type !== 'group') throw new Error(`shape ${args.shapeId} is ${found.shape.type}, not a group`)
      const frameId = found.shape.frameId
      const frame = frameId === undefined ? undefined : found.page.objects[frameId]
      if (frame === undefined || frame.type !== 'frame') throw new Error('the group has no parent frame')
      const children = Array.isArray(found.shape.shapes) ? found.shape.shapes : []
      const frameOrder = Array.isArray(frame.shapes) ? frame.shapes : []
      const nextFrameShapes = frameOrder.flatMap((shapeId) => shapeId === found.shape.id ? children : [shapeId])
      await backend.updateFile({
        fileId: file.id,
        revn: file.revn,
        vern: file.vern,
        changes: [
          { type: 'mod-obj', id: found.shape.id, 'page-id': found.page.id, operations: [{ type: 'assign', value: { shapes: [] } }] },
          { type: 'mod-obj', id: frameId, 'page-id': found.page.id, operations: [{ type: 'assign', value: { shapes: nextFrameShapes } }] },
          ...children.map((shapeId) => ({
            type: 'mod-obj',
            id: shapeId,
            'page-id': found.page.id,
            operations: [{ type: 'assign', value: { parentId: frameId, frameId } }],
          })),
          { type: 'del-obj', id: found.shape.id, 'page-id': found.page.id },
        ],
      })
      return { id: found.shape.id }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_add_image',
    description: 'Upload an image from a local path or URL, then place it inside a frame. Use a path for a file reachable by the DSH host; use a public URL only when the Penpot server can fetch it (private addresses are blocked by Penpot SSRF rules).',
    parameters: {
      fileId: { type: 'string', required: true, description: 'File uuid.' },
      frameId: { type: 'string', required: true, description: 'Containing frame uuid.' },
      pageId: { type: 'string', description: 'Page uuid; defaults to the first page.' },
      path: { type: 'string', description: 'Absolute local image path. Give exactly one of path or url.' },
      url: { type: 'string', description: 'Public image URL the Penpot server can fetch. Give exactly one of path or url.' },
      name: { type: 'string', description: 'Layer and media name; default "Image".' },
      x: { type: 'number', required: true, description: 'Page x coordinate.' },
      y: { type: 'number', required: true, description: 'Page y coordinate.' },
      width: { type: 'number', description: 'Width; defaults to the image width. With only one dimension the aspect ratio is preserved.' },
      height: { type: 'number', description: 'Height; defaults to the image height. With only one dimension the aspect ratio is preserved.' },
      index: { type: 'number', description: 'Insertion index in the frame; defaults to the end (top).' },
    },
    output: idOutput('created image'),
    async execute(args) {
      if ((args.path === undefined) === (args.url === undefined)) throw new Error('penpot_add_image needs exactly one of path or url')
      const backend = requireBackend()
      const name = args.name ?? 'Image'
      const media = args.path !== undefined
        ? await backend.uploadMedia({ fileId: args.fileId, path: args.path, name, isLocal: false })
        : await backend.createMediaFromUrl({ fileId: args.fileId, url: args.url ?? '', name, isLocal: false })
      if (media.width <= 0 || media.height <= 0) throw new Error('Penpot did not report image dimensions')
      const ratio = media.width / media.height
      const width = args.width ?? (args.height === undefined ? media.width : args.height * ratio)
      const height = args.height ?? (args.width === undefined ? media.height : args.width / ratio)
      const file = await backend.fileData(args.fileId)
      const page = pageOf(file, args.pageId)
      const frame = page.objects[args.frameId]
      if (frame === undefined || frame.type !== 'frame') throw new Error(`frame ${args.frameId} is not on page ${page.id}`)
      const id = randomUUID()
      const shape = createImage({
        id,
        name,
        pageId: page.id,
        frameId: args.frameId,
        x: args.x,
        y: args.y,
        width,
        height,
        media,
      })
      await addShape(backend, file, page, shape, args.frameId, args.index)
      return { id }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_add_text',
    description: 'Add a text layer inside a frame. x/y are page coordinates. Each explicit newline becomes a positioned line; keep width generous and use height to size the box.',
    parameters: {
      fileId: { type: 'string', required: true, description: 'File uuid.' },
      frameId: { type: 'string', required: true, description: 'Containing frame uuid from penpot_pages.' },
      pageId: { type: 'string', description: 'Page uuid; defaults to the first page.' },
      name: { type: 'string', description: 'Layer name; default "Text".' },
      x: { type: 'number', required: true, description: 'Page x coordinate.' },
      y: { type: 'number', required: true, description: 'Page y coordinate.' },
      width: { type: 'number', description: 'Text box width; default 320.' },
      height: { type: 'number', description: 'Text box height; default is computed from lines and font size.' },
      text: { type: 'string', required: true, description: 'Text content; newlines create paragraphs.' },
      fontFamily: { type: 'string', description: 'Font family; default Inter.' },
      fontSize: { type: 'number', description: 'Font size in px; default 14.' },
      fontWeight: { type: 'number', description: 'Font weight; default 400.' },
      lineHeight: { type: 'number', description: 'Line-height multiplier; default 1.4.' },
      letterSpacing: { type: 'number', description: 'Letter spacing in px; default 0.' },
      color: { type: 'string', description: 'Text color; default #111827.' },
      align: { type: 'string', description: 'left, right, center or justify; default left.' },
      wrap: { type: 'boolean', description: 'Approximate wrapping inside width; default true.' },
      index: { type: 'number', description: 'Insertion index in the frame; defaults to the end (top).' },
    },
    output: idOutput('created text'),
    async execute(args) {
      const backend = requireBackend()
      const file = await backend.fileData(args.fileId)
      const page = pageOf(file, args.pageId)
      const frame = page.objects[args.frameId]
      if (frame === undefined || frame.type !== 'frame') throw new Error(`frame ${args.frameId} is not on page ${page.id}`)
      const id = randomUUID()
      const shape = createText({
        id,
        name: args.name ?? 'Text',
        pageId: page.id,
        frameId: args.frameId,
        x: args.x,
        y: args.y,
        width: args.width ?? 320,
        ...(args.height === undefined ? {} : { height: args.height }),
        text: args.text,
        style: textStyleFrom(args),
        ...(args.wrap === undefined ? {} : { wrap: args.wrap }),
      })
      await addShape(backend, file, page, shape, args.frameId, args.index)
      return { id }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_update_text',
    description: 'Replace a text layer\'s copy and recompute its line layout and height. Keeps the first run\'s typography unless style parameters override it.',
    parameters: {
      fileId: { type: 'string', required: true, description: 'File uuid.' },
      shapeId: { type: 'string', required: true, description: 'Text shape uuid from penpot_find or penpot_outline.' },
      text: { type: 'string', required: true, description: 'New text content.' },
      width: { type: 'number', description: 'New box width; defaults to the current width.' },
      height: { type: 'number', description: 'New box height; defaults to a computed height.' },
      fontFamily: { type: 'string', description: 'Override font family.' },
      fontSize: { type: 'number', description: 'Override font size in px.' },
      fontWeight: { type: 'number', description: 'Override font weight.' },
      lineHeight: { type: 'number', description: 'Override line-height multiplier.' },
      letterSpacing: { type: 'number', description: 'Override letter spacing in px.' },
      color: { type: 'string', description: 'Override text color.' },
      align: { type: 'string', description: 'Override left, right, center or justify.' },
      wrap: { type: 'boolean', description: 'Approximate wrapping inside width; default true.' },
    },
    output: idOutput('updated text'),
    async execute(args) {
      const backend = requireBackend()
      const file = await backend.fileData(args.fileId)
      const found = locateShape(file, args.shapeId)
      if (found === undefined) throw new Error(`shape ${args.shapeId} is not in file ${args.fileId}`)
      if (found.shape.type !== 'text') throw new Error(`shape ${args.shapeId} is ${found.shape.type}, not text`)
      const updated = updateTextShape(found.shape, args.text, textStyleFrom(args), {
        ...(args.width === undefined ? {} : { width: args.width }),
        ...(args.height === undefined ? {} : { height: args.height }),
        ...(args.wrap === undefined ? {} : { wrap: args.wrap }),
      })
      const height = updated.height
      const width = updated.width
      const selrect = {
        x: found.shape.x,
        y: found.shape.y,
        width,
        height,
        x1: found.shape.x,
        y1: found.shape.y,
        x2: found.shape.x + width,
        y2: found.shape.y + height,
      }
      const points = [
        { x: found.shape.x, y: found.shape.y },
        { x: found.shape.x + width, y: found.shape.y },
        { x: found.shape.x + width, y: found.shape.y + height },
        { x: found.shape.x, y: found.shape.y + height },
      ]
      await backend.updateFile({
        fileId: file.id,
        revn: file.revn,
        vern: file.vern,
        changes: [{
          type: 'mod-obj',
          id: found.shape.id,
          'page-id': found.page.id,
          operations: [{
            type: 'assign',
            value: {
              content: updated.content,
              positionData: updated.positionData,
              width,
              height,
              selrect,
              points,
            },
          }],
        }],
      })
      return { id: found.shape.id }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_delete_shape',
    description: 'Delete a layer, or a frame and its subtree. Take a snapshot first when the design matters; deletion is not undoable through this plugin.',
    parameters: {
      fileId: { type: 'string', required: true, description: 'File uuid.' },
      shapeId: { type: 'string', required: true, description: 'Shape or frame uuid to delete.' },
    },
    output: idOutput('deleted shape'),
    async execute(args) {
      const backend = requireBackend()
      const file = await backend.fileData(args.fileId)
      const found = locateShape(file, args.shapeId)
      if (found === undefined) throw new Error(`shape ${args.shapeId} is not in file ${args.fileId}`)
      if (found.shape.id === ROOT_ID) throw new Error('the page root cannot be deleted')
      await backend.updateFile({
        fileId: file.id,
        revn: file.revn,
        vern: file.vern,
        changes: [{ type: 'del-obj', id: found.shape.id, 'page-id': found.page.id }],
      })
      return { id: found.shape.id }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_update_shape',
    description: 'Update a shape\'s name, solid fill, corner radius, opacity or geometry. Moving a frame also shifts its descendants; resizing a frame does not. Text color is changed through penpot_update_text.',
    parameters: {
      fileId: { type: 'string', required: true, description: 'File uuid.' },
      shapeId: { type: 'string', required: true, description: 'Shape or frame uuid.' },
      name: { type: 'string', description: 'New layer name.' },
      x: { type: 'number', description: 'New page x coordinate.' },
      y: { type: 'number', description: 'New page y coordinate.' },
      width: { type: 'number', description: 'New width.' },
      height: { type: 'number', description: 'New height.' },
      fill: { type: 'string', description: 'New solid fill color. Not supported for text; use penpot_update_text color.' },
      radius: { type: 'number', description: 'New corner radius for a frame or rect.' },
      opacity: { type: 'number', description: 'New 0…1 opacity.' },
    },
    output: idOutput('updated shape'),
    async execute(args) {
      const backend = requireBackend()
      const file = await backend.fileData(args.fileId)
      const found = locateShape(file, args.shapeId)
      if (found === undefined) throw new Error(`shape ${args.shapeId} is not in file ${args.fileId}`)
      const shape = found.shape
      if (shape.id === ROOT_ID) throw new Error('the page root cannot be updated')
      if (shape.type === 'text' && args.fill !== undefined) throw new Error('text color: use penpot_update_text with color')
      if (shape.type === 'text' && args.radius !== undefined) throw new Error('corner radius does not apply to text')
      if (shape.type !== 'frame' && shape.type !== 'rect' && args.radius !== undefined) throw new Error('corner radius applies to frames and rects')
      const geometryChanged = args.x !== undefined || args.y !== undefined || args.width !== undefined || args.height !== undefined
      if (geometryChanged && !['frame', 'rect', 'circle', 'text'].includes(shape.type)) {
        throw new Error('geometry editing is supported for frames, rects, circles and text')
      }
      const x = args.x ?? shape.x
      const y = args.y ?? shape.y
      const width = args.width ?? shape.width
      const height = args.height ?? shape.height
      if (width <= 0 || height <= 0) throw new Error('width and height must be positive')
      const value: Record<string, unknown> = {}
      if (args.name !== undefined) value.name = args.name
      if (args.opacity !== undefined) value.opacity = args.opacity
      if (geometryChanged) {
        value.x = x
        value.y = y
        value.width = width
        value.height = height
        value.selrect = {
          x,
          y,
          width,
          height,
          x1: x,
          y1: y,
          x2: x + width,
          y2: y + height,
        }
        value.points = [
          { x, y },
          { x: x + width, y },
          { x: x + width, y: y + height },
          { x, y: y + height },
        ]
      }
      if (shape.type === 'text' && geometryChanged) {
        const dx = x - shape.x
        const dy = y - shape.y
        if (width !== shape.width) {
          const rewrapped = updateTextShape(shape, shapeText(shape), {}, {
            width,
            ...(args.height === undefined ? {} : { height: args.height }),
          })
          value.content = rewrapped.content
          value.positionData = rewrapped.positionData
          value.height = rewrapped.height
        } else {
          const entries = Array.isArray(shape.positionData) ? shape.positionData : []
          if (entries.length > 0) {
            value.positionData = entries.map((entry) => ({
              ...entry,
              x: Number(entry['x'] ?? shape.x) + dx,
              y: Number(entry['y'] ?? shape.y) + dy,
            }))
          }
        }
      }
      if (args.fill !== undefined) value.fills = [{ fillColor: args.fill, fillOpacity: 1 }]
      if (args.radius !== undefined) {
        value.r1 = args.radius
        value.r2 = args.radius
        value.r3 = args.radius
        value.r4 = args.radius
      }
      if (Object.keys(value).length === 0) throw new Error('penpot_update_shape needs at least one property to change')
      const changes: Array<Record<string, unknown>> = [{
        type: 'mod-obj',
        id: shape.id,
        'page-id': found.page.id,
        operations: [{ type: 'assign', value }],
      }]
      if (shape.type === 'frame' && geometryChanged && (x !== shape.x || y !== shape.y)) {
        const dx = x - shape.x
        const dy = y - shape.y
        const descendants: PenpotShape[] = []
        const collect = (parentId: string): void => {
          for (const child of childrenOf(found.page, parentId)) {
            descendants.push(child)
            collect(child.id)
          }
        }
        collect(shape.id)
        for (const child of descendants) {
          const shifted: Record<string, unknown> = {
            x: child.x + dx,
            y: child.y + dy,
            selrect: {
              ...(typeof child.selrect === 'object' && child.selrect !== null ? child.selrect as Record<string, number> : { x: child.x, y: child.y, width: child.width, height: child.height, x1: child.x, y1: child.y, x2: child.x + child.width, y2: child.y + child.height }),
              x: child.x + dx,
              y: child.y + dy,
              x1: child.x + dx,
              y1: child.y + dy,
              x2: child.x + dx + child.width,
              y2: child.y + dy + child.height,
            },
            points: (Array.isArray(child.points) ? child.points : []).map((point) => ({
              x: Number((point as { x?: unknown }).x ?? 0) + dx,
              y: Number((point as { y?: unknown }).y ?? 0) + dy,
            })),
          }
          if (child.type === 'text' && Array.isArray(child.positionData)) {
            shifted.positionData = child.positionData.map((entry) => ({
              ...entry,
              x: Number(entry['x'] ?? child.x) + dx,
              y: Number(entry['y'] ?? child.y) + dy,
            }))
          }
          changes.push({ type: 'mod-obj', id: child.id, 'page-id': found.page.id, operations: [{ type: 'assign', value: shifted }] })
        }
      }
      await backend.updateFile({ fileId: file.id, revn: file.revn, vern: file.vern, changes })
      return { id: shape.id }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_create_comment_thread',
    description: 'Create a comment thread anchored to a frame at a page-coordinate point. Use penpot_comments to read it back.',
    parameters: {
      fileId: { type: 'string', required: true, description: 'File uuid.' },
      frameId: { type: 'string', required: true, description: 'Frame the thread is anchored to.' },
      pageId: { type: 'string', description: 'Page uuid; defaults to the first page.' },
      x: { type: 'number', required: true, description: 'Page x coordinate of the pin.' },
      y: { type: 'number', required: true, description: 'Page y coordinate of the pin.' },
      content: { type: 'string', required: true, description: 'Comment text.' },
    },
    output: idOutput('created comment thread'),
    async execute(args) {
      const backend = requireBackend()
      const file = await backend.fileData(args.fileId)
      const page = pageOf(file, args.pageId)
      const frame = page.objects[args.frameId]
      if (frame === undefined || frame.type !== 'frame') throw new Error(`frame ${args.frameId} is not on page ${page.id}`)
      const result = await backend.createCommentThread({
        fileId: file.id,
        pageId: page.id,
        frameId: args.frameId,
        x: args.x,
        y: args.y,
        content: args.content,
      })
      return result
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_reply_comment',
    description: 'Reply to an existing comment thread.',
    parameters: {
      threadId: { type: 'string', required: true, description: 'Thread uuid from penpot_comments.' },
      content: { type: 'string', required: true, description: 'Reply text.' },
    },
    output: idOutput('created reply'),
    async execute(args) {
      const backend = requireBackend()
      return await backend.createComment({ threadId: args.threadId, content: args.content })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_update_comment',
    description: 'Edit the text of an existing comment.',
    parameters: {
      commentId: { type: 'string', required: true, description: 'Comment uuid from penpot_comments.' },
      content: { type: 'string', required: true, description: 'New comment text.' },
    },
    output: idOutput('updated comment'),
    async execute(args) {
      const backend = requireBackend()
      await backend.updateComment({ commentId: args.commentId, content: args.content })
      return { id: args.commentId }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_delete_comment',
    description: 'Delete an existing comment. This removes the message, not the whole thread.',
    parameters: {
      commentId: { type: 'string', required: true, description: 'Comment uuid from penpot_comments.' },
    },
    output: idOutput('deleted comment'),
    async execute(args) {
      const backend = requireBackend()
      await backend.deleteComment({ commentId: args.commentId })
      return { id: args.commentId }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_resolve_comment',
    description: 'Mark a comment thread resolved or open.',
    parameters: {
      threadId: { type: 'string', required: true, description: 'Thread uuid from penpot_comments.' },
      resolved: { type: 'boolean', description: 'true to resolve (default), false to reopen.' },
    },
    output: textOutput('Resolution result.'),
    async execute(args) {
      const backend = requireBackend()
      const resolved = args.resolved ?? true
      await backend.setCommentThreadResolved({ threadId: args.threadId, resolved })
      return { text: `${resolved ? 'resolved' : 'reopened'} comment thread ${args.threadId}` }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_frame_svg',
    description: 'Render a frame to a best-effort SVG on disk. Supports frames, rects, circles, text and groups with solid fills, strokes and radii; images are placeholders and paths/effects are omitted.',
    parameters: {
      fileId: { type: 'string', required: true, description: 'File uuid.' },
      frameId: { type: 'string', required: true, description: 'Frame uuid.' },
      path: { type: 'string', required: true, description: 'Absolute path to write the .svg.' },
      pageId: { type: 'string', description: 'Page uuid; defaults to the first page.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true, description: 'Where the SVG was written.' },
          bytes: { type: 'number', required: true, description: 'Size in bytes.' },
          limitations: { type: 'array', required: true, description: 'Features replaced or omitted.', items: { type: 'string' } },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `${value.path} (${String(value.bytes)} bytes)${value.limitations.length === 0 ? '' : `\nlimitations: ${value.limitations.join('; ')}`}` }],
    },
    async execute(args) {
      const backend = requireBackend()
      const page = await backend.page(args.fileId, args.pageId)
      const render = renderFrameSvg(page, args.frameId)
      await writeFile(args.path, render.svg, 'utf8')
      return { path: args.path, bytes: Buffer.byteLength(render.svg), limitations: render.limitations }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_frame_png',
    description: 'Render a frame to PNG using the headless browser path configured on the Plugins page. The browser renders the plugin SVG, so the result is a best-effort preview, not Penpot\'s exact canvas renderer.',
    parameters: {
      fileId: { type: 'string', required: true, description: 'File uuid.' },
      frameId: { type: 'string', required: true, description: 'Frame uuid.' },
      path: { type: 'string', required: true, description: 'Absolute path to write the .png.' },
      pageId: { type: 'string', description: 'Page uuid; defaults to the first page.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true, description: 'Where the PNG was written.' },
          bytes: { type: 'number', required: true, description: 'Size in bytes.' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `${value.path} (${String(value.bytes)} bytes)` }],
    },
    async execute(args) {
      const browserPath = config.browserPath.get()
      if (browserPath.length === 0) {
        throw new Error('penpot_frame_png needs a headless browser: set the browser path on the Plugins page, or use penpot_frame_svg')
      }
      const backend = requireBackend()
      const page = await backend.page(args.fileId, args.pageId)
      const render = renderFrameSvg(page, args.frameId)
      const result = await renderSvgToPng({
        svg: render.svg,
        width: render.width,
        height: render.height,
        path: args.path,
        browserPath,
      })
      return { path: args.path, bytes: result.bytes }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'penpot_download_asset',
    description: 'Download a Penpot asset/media id to disk. Requires the deployment to proxy /assets/by-id/ to the backend.',
    parameters: {
      assetId: { type: 'string', required: true, description: 'Asset/media uuid from Penpot object thumbnails or export metadata.' },
      path: { type: 'string', required: true, description: 'Absolute path to write.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true, description: 'Where the asset was written.' },
          bytes: { type: 'number', required: true, description: 'Size in bytes.' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `${value.path} (${String(value.bytes)} bytes)` }],
    },
    async execute(args) {
      const apiUrl = config.apiUrl.get()
      const token = config.token.get()
      if (apiUrl.length === 0 || token.length === 0) throw new Error('Penpot is not configured')
      const base = apiUrl.replace(/\/+$/u, '').replace(/\/api\/rpc$/u, '')
      const url = `${base}/assets/by-id/${encodeURIComponent(args.assetId)}`
      const response = await fetch(url, { headers: { authorization: `Token ${token}` } })
      if (!response.ok) throw new Error(`asset download failed: HTTP ${String(response.status)} (the deployment must proxy /assets/by-id/)`)
      const bytes = new Uint8Array(await response.arrayBuffer())
      await writeFile(args.path, bytes)
      return { path: args.path, bytes: bytes.byteLength }
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
