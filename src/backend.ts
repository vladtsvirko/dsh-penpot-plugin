/**
 * The backend seam.
 *
 * Penpot can be reached two ways: directly over its HTTP RPC with an access
 * token, or through an MCP server someone already runs (the official Penpot MCP
 * registers its tools as `mcp__<server>__*` in this runtime). The plugin owns one
 * small interface so the tools do not care which is in use, and so a deployment
 * can switch backends without touching the model-facing surface.
 *
 * Write operations are deliberately absent from v0.1: Penpot's `update-file`
 * needs its change format, and the read/export/import set is the part that can
 * be proven first.
 *
 * @module dsh-penpot-plugin/backend
 */

/** One addressable Penpot object, reduced to what a tool reply needs. */
export interface PenpotRef {
  id: string
  name: string
}

/** A file summary: enough to identify a design without shipping its contents. */
export interface PenpotFileSummary {
  id: string
  name: string
  /** Pages in the file, when the backend reports them. */
  pages?: PenpotRef[]
  /** Backend-specific extras, passed through as-is. */
  raw?: unknown
}

/** What a backend must provide. Every method throws on refusal. */
export interface PenpotBackend {
  /** Which implementation is live; surfaced by the status tool and `/about`-style checks. */
  readonly kind: 'api' | 'mcp'
  /** Short human label, e.g. `api http://192.168.2.50:8090` or `mcp penpot`. */
  readonly label: string
  listTeams(): Promise<PenpotRef[]>
  listProjects(teamId?: string): Promise<PenpotRef[]>
  listFiles(projectId: string): Promise<PenpotRef[]>
  searchFiles(term: string): Promise<PenpotRef[]>
  fileSummary(fileId: string): Promise<PenpotFileSummary>
  /** Whole-file export as `.penpot` bytes. */
  exportFile(fileId: string): Promise<Uint8Array>
  /** Import a `.penpot` file, either as a new file or in place. */
  importFile(input: { path: string; projectId?: string; fileId?: string; name?: string }): Promise<{ id?: string; raw?: unknown }>
}

/** Raised when a backend cannot serve an operation at all. */
export class UnsupportedOperation extends Error {
  constructor(operation: string, backend: string) {
    super(`${operation} is not supported by the ${backend} backend`)
    this.name = 'UnsupportedOperation'
  }
}
