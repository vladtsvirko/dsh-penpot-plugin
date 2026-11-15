/**
 * The backend seam.
 *
 * Penpot is reached over its HTTP RPC with an access token. The plugin owns one
 * small interface so the model-facing tools stay independent of the transport
 * details (and of future changes to them).
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

/**
 * One shape from `get-file` / `get-page`. Penpot's shape schema is large and
 * moves between 2.x minors, so the interface names the stable fields and keeps
 * the rest reachable through the index signature.
 */
export interface PenpotShape {
  id: string
  name: string
  type: string
  x: number
  y: number
  width: number
  height: number
  parentId?: string
  frameId?: string
  shapes?: string[]
  fills?: Array<Record<string, unknown>>
  strokes?: Array<Record<string, unknown>>
  content?: unknown
  positionData?: Array<Record<string, unknown>>
  r1?: number
  r2?: number
  r3?: number
  r4?: number
  opacity?: number
  [key: string]: unknown
}

/** A Penpot page and its objects. */
export interface PenpotPage {
  id: string
  name: string
  objects: Record<string, PenpotShape>
  flows?: Record<string, Record<string, unknown>>
}

/** The parts of a file the design tools read. */
export interface PenpotFileData {
  id: string
  name: string
  revn: number
  vern: number
  projectId?: string
  teamId?: string
  data: {
    pages: string[]
    pagesIndex: Record<string, PenpotPage>
    tokensLib?: Record<string, unknown>
    typographies?: Record<string, unknown>
    components?: Record<string, Record<string, unknown>>
  }
}

/** A comment thread on a file. */
export interface PenpotCommentThread {
  id: string
  seqn: number
  content: string
  isResolved: boolean
  pageId: string
  pageName?: string
  frameId: string
  position?: { x: number; y: number }
  ownerFullname?: string
  createdAt?: string
  modifiedAt?: string
  countComments?: number
  countUnreadComments?: number
}

/** One comment inside a thread. */
export interface PenpotComment {
  id: string
  threadId: string
  content: string
  ownerFullname?: string
  createdAt?: string
}

/** A file snapshot (version history entry). */
export interface PenpotSnapshot {
  id: string
  label?: string
  revn?: number
  createdAt?: string
  createdBy?: string
}

/** A library linked to a file, or a file using this one as a library. */
export interface PenpotLibrary {
  id: string
  name: string
  projectId?: string
  syncedAt?: string
  isIndirect?: boolean
}

/** A file media object (image/asset). */
export interface PenpotMedia {
  id: string
  mediaId?: string
  width: number
  height: number
  mtype?: string
  name?: string
}

/** A built-in Penpot template. */
export interface PenpotTemplate {
  id: string
  name: string
}

/** What a backend must provide. Every method throws on refusal. */
export interface PenpotBackend {
  /** Backend kind; surfaced by the status tool. */
  readonly kind: 'api'
  /** Short human label, e.g. `api http://localhost:8090`. */
  readonly label: string
  listTeams(): Promise<PenpotRef[]>
  listProjects(teamId?: string): Promise<PenpotRef[]>
  listFiles(projectId: string): Promise<PenpotRef[]>
  searchFiles(teamId: string, term: string): Promise<PenpotRef[]>
  fileSummary(fileId: string): Promise<PenpotFileSummary>
  /** Whole-file read: pages, shapes, token library. */
  fileData(fileId: string): Promise<PenpotFileData>
  /** One page, optionally pruned to one object subtree. */
  page(fileId: string, pageId?: string, objectId?: string): Promise<PenpotPage>
  /** Comment threads, newest first as Penpot returns them. */
  commentThreads(fileId: string): Promise<PenpotCommentThread[]>
  comments(threadId: string): Promise<PenpotComment[]>
  snapshots(fileId: string): Promise<PenpotSnapshot[]>
  createSnapshot(fileId: string, label?: string): Promise<PenpotSnapshot>
  /** Libraries used by this file. */
  libraries(fileId: string): Promise<PenpotLibrary[]>
  /** Built-in templates available on the deployment. */
  templates(): Promise<PenpotTemplate[]>
  /** Create a project in a team. */
  createProject(input: { teamId: string; name: string }): Promise<PenpotRef>
  /** Create an empty file in a project. */
  createFile(input: { projectId: string; name: string }): Promise<PenpotRef>
  /** Upload a local image as a file media object. */
  uploadMedia(input: { fileId: string; path: string; name?: string; isLocal?: boolean }): Promise<PenpotMedia>
  /** Download an image URL server-side into a file media object. */
  createMediaFromUrl(input: { fileId: string; url: string; name?: string; isLocal?: boolean }): Promise<PenpotMedia>
  /** Duplicate a file in its current project/team. */
  duplicateFile(input: { fileId: string; name?: string }): Promise<PenpotRef>
  /** Apply Penpot `update-file` changes against the current revision. */
  updateFile(input: {
    fileId: string
    revn: number
    vern: number
    changes: Array<Record<string, unknown>>
  }): Promise<unknown>
  /** Create a comment thread anchored to a frame. */
  createCommentThread(input: {
    fileId: string
    pageId: string
    frameId: string
    x: number
    y: number
    content: string
  }): Promise<{ id: string }>
  /** Reply to an existing comment thread. */
  createComment(input: { threadId: string; content: string }): Promise<{ id: string }>
  /** Mark a comment thread resolved or open. */
  setCommentThreadResolved(input: { threadId: string; resolved: boolean }): Promise<void>
  /** Edit an existing comment. */
  updateComment(input: { commentId: string; content: string }): Promise<void>
  /** Delete an existing comment. */
  deleteComment(input: { commentId: string }): Promise<void>
  /** Clone a built-in template into a project; some templates produce several files. */
  cloneTemplate(input: { projectId: string; templateId: string }): Promise<PenpotRef[]>
  /** Whole-file export as `.penpot` bytes. */
  exportFile(fileId: string): Promise<Uint8Array>
  /** Import a `.penpot` file, either as a new file or in place. */
  importFile(input: { path: string; projectId?: string; fileId?: string; name?: string }): Promise<{ id?: string; raw?: unknown }>
}
