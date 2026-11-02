/**
 * MCP backend: delegate to an MCP server that is already registered in this
 * runtime (the official Penpot MCP does this through the plugin bridge).
 *
 * `@deepseek-ai/dsh-mcp-client` registers every MCP tool as
 * `mcp__<serverName>__<rawName>`, so this backend only needs the tools service.
 * The tool *names* differ between MCP servers, which is why they are a mapping
 * with defaults rather than hardcoded calls.
 *
 * Open design question for v0.2: the exact invocation shape of
 * `ctx.tools.execute()` — the narrow interface below is what the plugin needs,
 * and index.ts adapts the runtime to it.
 *
 * @module dsh-penpot-plugin/mcp-backend
 */

import { UnsupportedOperation, type PenpotBackend, type PenpotFileSummary, type PenpotRef } from './backend.js'

/** The single method this backend needs from the runtime's tool registry. */
export interface ToolInvoker {
  get(name: string): unknown
  invoke?(name: string, args: Record<string, unknown>): Promise<unknown>
}

export interface McpToolNames {
  listTeams: string
  listProjects: string
  listFiles: string
  searchFiles: string
  fileSummary: string
}

export const DEFAULT_MCP_TOOLS: McpToolNames = {
  listTeams: 'list_teams',
  listProjects: 'list_projects',
  listFiles: 'list_files',
  searchFiles: 'search_files',
  fileSummary: 'get_file',
}

export interface McpBackendOptions {
  tools: ToolInvoker
  serverName: string
  toolNames?: Partial<McpToolNames>
}

const asRefs = (value: unknown): PenpotRef[] => {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item) => ({ id: String(item['id'] ?? ''), name: String(item['name'] ?? '') }))
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>
    for (const key of ['files', 'projects', 'teams', 'items', 'results']) {
      if (Array.isArray(record[key])) return asRefs(record[key])
    }
  }
  return []
}

/**
 * MCP results arrive as content blocks; a text block often carries JSON. Anything
 * else is returned as-is so a caller can still see what the server said.
 */
const unwrap = (result: unknown): unknown => {
  if (typeof result !== 'object' || result === null) return result
  const record = result as Record<string, unknown>
  const content = record['content']
  if (!Array.isArray(content)) return record['value'] ?? result
  const text = content
    .filter((block): block is { type: string; text: string } => typeof block === 'object' && block !== null && (block as { type?: unknown }).type === 'text')
    .map((block) => block.text)
    .join('\n')
  if (text.length === 0) return result
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export function createMcpBackend(options: McpBackendOptions): PenpotBackend {
  const names = { ...DEFAULT_MCP_TOOLS, ...options.toolNames }
  const qualified = (raw: string): string => `mcp__${options.serverName}__${raw}`

  const call = async (operation: string, raw: string, args: Record<string, unknown>): Promise<unknown> => {
    const name = qualified(raw)
    if (options.tools.get(name) === undefined || options.tools.invoke === undefined) {
      throw new UnsupportedOperation(operation, `mcp:${options.serverName}`)
    }
    return unwrap(await options.tools.invoke(name, args))
  }

  return {
    kind: 'mcp',
    label: `mcp ${options.serverName}`,

    async listTeams() {
      return asRefs(await call('listTeams', names.listTeams, {}))
    },
    async listProjects(teamId) {
      return asRefs(await call('listProjects', names.listProjects, teamId === undefined ? {} : { teamId }))
    },
    async listFiles(projectId) {
      return asRefs(await call('listFiles', names.listFiles, { projectId }))
    },
    async searchFiles(term) {
      return asRefs(await call('searchFiles', names.searchFiles, { query: term }))
    },
    async fileSummary(fileId): Promise<PenpotFileSummary> {
      const raw = await call('fileSummary', names.fileSummary, { fileId })
      const record = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
      return { id: String(record['id'] ?? fileId), name: String(record['name'] ?? ''), raw }
    },
    async exportFile() {
      throw new UnsupportedOperation('exportFile', `mcp:${options.serverName}`)
    },
    async importFile() {
      throw new UnsupportedOperation('importFile', `mcp:${options.serverName}`)
    },
  }
}
