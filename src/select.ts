/**
 * Backend selection.
 *
 * Kept pure so it is testable without a runtime: given the config and the tools
 * registry, decide which backend is live or fail with a message a user can act on.
 *
 * @module dsh-penpot-plugin/select
 */

import { createApiBackend } from './api-backend.js'
import { createMcpBackend, DEFAULT_MCP_TOOLS, type ToolInvoker } from './mcp-backend.js'
import type { PenpotBackend } from './backend.js'

export interface PenpotConfig {
  /** Penpot origin, e.g. http://192.168.2.50:8090 */
  apiUrl?: string
  /** Access token from Penpot's Settings → Access tokens. */
  token?: string
  /** `auto` prefers an existing MCP tool set, then the API. */
  backend?: 'auto' | 'api' | 'mcp'
  /** MCP server name used by dsh-mcp-client. */
  mcpServer?: string
}

export interface SelectDependencies {
  tools: ToolInvoker
  fetchImpl?: typeof fetch
}

const mcpAvailable = (tools: ToolInvoker, server: string): boolean =>
  Object.values(DEFAULT_MCP_TOOLS).some((raw) => tools.get(`mcp__${server}__${raw}`) !== undefined)

/**
 * Pick a backend, or explain why none can work.
 *
 * `auto` prefers MCP when a live Penpot MCP tool set is registered — it may
 * expose a richer surface (the official one drives the canvas) — and falls back
 * to the API, which only needs a URL and a token.
 */
export function selectBackend(config: PenpotConfig, dependencies: SelectDependencies): PenpotBackend {
  const backend = config.backend ?? 'auto'
  const server = config.mcpServer ?? 'penpot'
  const hasApi = typeof config.apiUrl === 'string' && config.apiUrl.length > 0
    && typeof config.token === 'string' && config.token.length > 0

  if (backend === 'mcp') {
    if (!mcpAvailable(dependencies.tools, server)) {
      throw new Error(`backend is mcp but no mcp__${server}__* tools are registered`)
    }
    return createMcpBackend({ tools: dependencies.tools, serverName: server })
  }
  if (backend === 'api') {
    if (!hasApi) throw new Error('backend is api but apiUrl/token are not set (PENPOT_API_URL, PENPOT_ACCESS_TOKEN)')
    return createApiBackend({ apiUrl: config.apiUrl as string, token: config.token as string, ...(dependencies.fetchImpl === undefined ? {} : { fetchImpl: dependencies.fetchImpl }) })
  }
  if (mcpAvailable(dependencies.tools, server)) {
    return createMcpBackend({ tools: dependencies.tools, serverName: server })
  }
  if (hasApi) {
    return createApiBackend({ apiUrl: config.apiUrl as string, token: config.token as string, ...(dependencies.fetchImpl === undefined ? {} : { fetchImpl: dependencies.fetchImpl }) })
  }
  throw new Error('no Penpot backend available: set PENPOT_API_URL and PENPOT_ACCESS_TOKEN, or register a Penpot MCP server')
}
