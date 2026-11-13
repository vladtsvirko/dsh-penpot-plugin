/**
 * Pure design analysis over Penpot's shape data.
 *
 * Penpot's shape schema is large and versioned; the helpers here only read the
 * stable fields (id, name, type, bounds, fills, text runs) and degrade to the
 * raw record for anything newer. Nothing in this module performs I/O, which
 * keeps the formatting and the token/audit rules testable with a fixture.
 *
 * @module dsh-penpot-plugin/design
 */

import type { PenpotFileData, PenpotPage, PenpotShape } from './backend.js'

/** Penpot's sentinel root object/frame. */
export const ROOT_ID = '00000000-0000-0000-0000-000000000000'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

const round = (value: number): number => Math.round(value * 10) / 10

const numberValue = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

const stringValue = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined

/** One text run: a span in the rich-text tree, or one `positionData` line. */
export interface TextRun {
  text: string
  fontFamily?: string
  fontSize: number
  fontWeight: number
  lineHeight?: string
  letterSpacing?: string
  fillColor?: string
  textAlign?: string
}

const fontSizeOf = (value: unknown): number => {
  const size = numberValue(value, 14)
  return size > 0 ? size : 14
}

/**
 * Extract plain text from a Penpot rich-text `content` tree. Paragraphs become
 * newlines; spans are concatenated without whitespace changes.
 */
export function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  const parts: string[] = []
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) walk(child)
      return
    }
    if (!isRecord(node)) return
    if (typeof node['text'] === 'string') parts.push(node['text'])
    for (const child of asArray(node['children'])) walk(child)
    if (node['type'] === 'paragraph' && parts.length > 0) {
      const last = parts[parts.length - 1]
      if (last !== undefined && !last.endsWith('\n')) parts.push('\n')
    }
  }
  walk(content)
  return parts.join('').replace(/\n+$/, '')
}

/** All text runs of a shape, with inherited typography applied. */
export function textRuns(shape: PenpotShape): TextRun[] {
  const runs: TextRun[] = []
  const walk = (node: unknown, inherited: Partial<TextRun>): void => {
    if (Array.isArray(node)) {
      for (const child of node) walk(child, inherited)
      return
    }
    if (!isRecord(node)) return
    const next: Partial<TextRun> = {
      ...inherited,
      ...(stringValue(node['fontFamily']) === undefined ? {} : { fontFamily: stringValue(node['fontFamily']) }),
      ...(node['fontSize'] === undefined ? {} : { fontSize: fontSizeOf(node['fontSize']) }),
      ...(node['fontWeight'] === undefined ? {} : { fontWeight: numberValue(node['fontWeight'], 400) }),
      ...(stringValue(node['lineHeight']) === undefined ? {} : { lineHeight: stringValue(node['lineHeight']) }),
      ...(stringValue(node['letterSpacing']) === undefined ? {} : { letterSpacing: stringValue(node['letterSpacing']) }),
      ...(stringValue(node['textAlign']) === undefined ? {} : { textAlign: stringValue(node['textAlign']) }),
    }
    const fills = asArray(node['fills'])
    const firstFill = fills.find(isRecord)
    const fillColor = firstFill === undefined ? undefined : stringValue(firstFill['fillColor'])
    if (fillColor !== undefined) next.fillColor = fillColor
    if (typeof node['text'] === 'string' && node['text'].length > 0) {
      runs.push({
        text: node['text'],
        ...(next.fontFamily === undefined ? {} : { fontFamily: next.fontFamily }),
        fontSize: next.fontSize ?? 14,
        fontWeight: next.fontWeight ?? 400,
        ...(next.lineHeight === undefined ? {} : { lineHeight: next.lineHeight }),
        ...(next.letterSpacing === undefined ? {} : { letterSpacing: next.letterSpacing }),
        ...(next.fillColor === undefined ? {} : { fillColor: next.fillColor }),
        ...(next.textAlign === undefined ? {} : { textAlign: next.textAlign }),
      })
    }
    for (const child of asArray(node['children'])) walk(child, next)
  }
  walk(shape.content, {})
  if (runs.length > 0) return runs
  for (const entry of asArray(shape.positionData)) {
    if (!isRecord(entry)) continue
    const text = stringValue(entry['text'])
    if (text === undefined) continue
    const fills = asArray(entry['fills'])
    const firstFill = fills.find(isRecord)
    runs.push({
      text,
      ...(stringValue(entry['fontFamily']) === undefined ? {} : { fontFamily: stringValue(entry['fontFamily']) }),
      fontSize: fontSizeOf(entry['fontSize']),
      fontWeight: numberValue(entry['fontWeight'], 400),
      ...(stringValue(entry['lineHeight']) === undefined ? {} : { lineHeight: stringValue(entry['lineHeight']) }),
      ...(stringValue(entry['letterSpacing']) === undefined ? {} : { letterSpacing: stringValue(entry['letterSpacing']) }),
      ...(firstFill === undefined || stringValue(firstFill['fillColor']) === undefined
        ? {}
        : { fillColor: stringValue(firstFill['fillColor']) }),
      ...(stringValue(entry['textAlign']) === undefined ? {} : { textAlign: stringValue(entry['textAlign']) }),
    })
  }
  return runs
}

/** Plain text of a text shape, with a fallback to its position data. */
export function shapeText(shape: PenpotShape): string {
  const fromContent = extractText(shape.content)
  if (fromContent.length > 0) return fromContent
  return textRuns(shape).map((run) => run.text).join('')
}

/** Top-level frames, ordered left-to-right, then top-to-bottom. */
export function pageFrames(page: PenpotPage): PenpotShape[] {
  return Object.values(page.objects)
    .filter((shape) => shape.type === 'frame' && shape.id !== ROOT_ID && shape.parentId === ROOT_ID)
    .sort((left, right) => left.x - right.x || left.y - right.y)
}

/** Number of real shapes on a page (the root sentinel is excluded). */
export function pageShapeCount(page: PenpotPage): number {
  return Object.keys(page.objects).filter((id) => id !== ROOT_ID).length
}

/** Ordered children of a shape, using Penpot's `shapes` array when present. */
export function childrenOf(page: PenpotPage, parentId: string): PenpotShape[] {
  const parent = page.objects[parentId]
  const ordered = asArray(parent?.shapes)
    .map((id) => (typeof id === 'string' ? page.objects[id] : undefined))
    .filter((shape): shape is PenpotShape => shape !== undefined)
  if (ordered.length > 0) return ordered
  return Object.values(page.objects).filter((shape) => shape.parentId === parentId && shape.id !== parentId)
}

/** The frame a shape belongs to, when it is in the page. */
export function frameOf(page: PenpotPage, shape: PenpotShape): PenpotShape | undefined {
  const frameId = shape.frameId ?? shape.parentId
  if (frameId === undefined) return undefined
  const frame = page.objects[frameId]
  return frame?.type === 'frame' ? frame : undefined
}

const truncate = (value: string, limit: number): string =>
  value.length <= limit ? value : `${value.slice(0, Math.max(0, limit - 1))}…`

const label = (shape: PenpotShape, page: PenpotPage, options: OutlineOptions): string => {
  const parts: string[] = []
  if (options.includeText !== false && shape.type === 'text') {
    const text = shapeText(shape).replace(/\s+/g, ' ').trim()
    if (text.length > 0) parts.push(`"${truncate(text, 100)}"`)
  }
  const runs = shape.type === 'text' ? textRuns(shape) : []
  const firstRun = runs[0]
  if (options.includeStyles !== false && firstRun !== undefined) {
    const weight = firstRun.fontWeight === 400 ? '' : `/${String(Math.round(firstRun.fontWeight))}`
    const color = firstRun.fillColor === undefined ? '' : ` ${firstRun.fillColor}`
    parts.push(`${firstRun.fontFamily ?? 'Inter'} ${String(Math.round(firstRun.fontSize))}${weight}${color}`)
  }
  if (options.includeStyles !== false && shape.type !== 'text') {
    const fill = asArray(shape.fills).find(isRecord)
    const fillColor = fill === undefined ? undefined : stringValue(fill['fillColor'])
    if (fillColor !== undefined) parts.push(fillColor)
    const stroke = asArray(shape.strokes).find(isRecord)
    const strokeColor = stroke === undefined ? undefined : stringValue(stroke['strokeColor'])
    if (strokeColor !== undefined) {
      const width = stroke === undefined ? '' : ` ${String(round(numberValue(stroke['strokeWidth'], 1)))}px`
      parts.push(`stroke ${strokeColor}${width}`)
    }
    const radius = Math.max(...[shape.r1, shape.r2, shape.r3, shape.r4].map((value) => numberValue(value)))
    if (radius > 0) parts.push(`radius ${String(round(radius))}`)
  }
  if (options.includeStyles !== false && numberValue(shape.opacity, 1) < 1) {
    parts.push(`opacity ${String(round(numberValue(shape.opacity, 1)))}`)
  }
  const bounds = `${String(round(shape.width))}×${String(round(shape.height))} at ${String(round(shape.x))},${String(round(shape.y))}`
  const children = childrenOf(page, shape.id)
  const childLabel = children.length === 0 ? '' : ` · ${String(children.length)} layer${children.length === 1 ? '' : 's'}`
  const name = shape.name.length === 0 ? '(unnamed)' : shape.name
  const details = parts.length === 0 ? '' : ` · ${parts.join(' · ')}`
  return `[${shape.type}] ${name}${details} · ${bounds}${childLabel} · #${shape.id}`
}

/** Outline rendering options. */
export interface OutlineOptions {
  /** Start at this shape instead of the page's top-level shapes. */
  rootId?: string
  /** Levels of nesting to print; default 4, capped at 12. */
  depth?: number
  /** Maximum shapes to print; default 300, capped at 2000. */
  maxShapes?: number
  /** Include fills, strokes, radii and typography; default true. */
  includeStyles?: boolean
  /** Include text content; default true. */
  includeText?: boolean
}

/** Render a page outline. */
export function renderOutline(page: PenpotPage, options: OutlineOptions = {}): string {
  const depth = Math.max(0, Math.min(12, Math.floor(options.depth ?? 4)))
  const maxShapes = Math.max(1, Math.min(2000, Math.floor(options.maxShapes ?? 300)))
  const lines: string[] = [`Page ${page.name.length === 0 ? '(unnamed)' : page.name} (${page.id})`]
  const roots = options.rootId === undefined
    ? [
        ...pageFrames(page),
        ...Object.values(page.objects).filter((shape) => shape.id !== ROOT_ID && (shape.parentId ?? ROOT_ID) === ROOT_ID && shape.type !== 'frame'),
      ]
    : [page.objects[options.rootId]].filter((shape): shape is PenpotShape => shape !== undefined)
  if (roots.length === 0) {
    lines.push(options.rootId === undefined ? 'No shapes on this page.' : `No shape ${options.rootId} on this page.`)
    return lines.join('\n')
  }
  let printed = 0
  let truncated = false
  const walk = (shape: PenpotShape, level: number): void => {
    if (printed >= maxShapes) {
      truncated = true
      return
    }
    lines.push(`${'  '.repeat(level)}${label(shape, page, options)}`)
    printed += 1
    const children = childrenOf(page, shape.id)
    if (children.length === 0) return
    if (level >= depth) {
      lines.push(`${'  '.repeat(level + 1)}… ${String(children.length)} nested layer${children.length === 1 ? '' : 's'} not shown (depth ${String(depth)})`)
      return
    }
    for (const child of children) walk(child, level + 1)
  }
  for (const root of roots) walk(root, 0)
  if (truncated || printed >= maxShapes) {
    lines.push(`… stopped after ${String(printed)} shapes; raise maxShapes or pass a rootId to focus.`)
  }
  return lines.join('\n')
}

/** Render a file's page and frame overview. */
export function renderPages(file: PenpotFileData, maxFrames = 100): string {
  const pageIds = file.data.pages.length > 0 ? file.data.pages : Object.keys(file.data.pagesIndex)
  const lines: string[] = [`# ${file.name.length === 0 ? '(unnamed file)' : file.name} (${file.id})`, `revn ${String(file.revn)}`]
  if (pageIds.length === 0) return `${lines.join('\n')}\nNo pages.`
  let framesShown = 0
  let framesTruncated = false
  for (const pageId of pageIds) {
    const page = file.data.pagesIndex[pageId]
    if (page === undefined) continue
    const frames = pageFrames(page)
    lines.push('')
    lines.push(`Page ${page.name.length === 0 ? '(unnamed)' : page.name} (${page.id}) — ${String(frames.length)} frame${frames.length === 1 ? '' : 's'}, ${String(pageShapeCount(page))} shape${pageShapeCount(page) === 1 ? '' : 's'}`)
    for (const frame of frames) {
      if (framesShown >= maxFrames) {
        framesTruncated = true
        break
      }
      const children = childrenOf(page, frame.id)
      lines.push(`  ${frame.name.length === 0 ? '(unnamed)' : frame.name} (${frame.id}) ${String(round(frame.width))}×${String(round(frame.height))} at ${String(round(frame.x))},${String(round(frame.y))} — ${String(children.length)} layer${children.length === 1 ? '' : 's'}`)
      framesShown += 1
    }
    if (framesTruncated) break
  }
  if (framesTruncated) lines.push('', `… more frames not shown (limit ${String(maxFrames)}).`)
  return lines.join('\n')
}

/** One shape search hit. */
export interface ShapeMatch {
  shape: PenpotShape
  frameName?: string
  text: string
}

/** Search shapes by name or text, optionally restricted by type. */
export function findShapes(page: PenpotPage, query: string, type?: string, limit = 50): { matches: ShapeMatch[]; total: number } {
  const needle = query.trim().toLowerCase()
  const max = Math.max(1, Math.min(200, Math.floor(limit)))
  const matches: ShapeMatch[] = []
  let total = 0
  for (const shape of Object.values(page.objects)) {
    if (shape.id === ROOT_ID) continue
    if (type !== undefined && type.length > 0 && shape.type !== type) continue
    const text = shape.type === 'text' ? shapeText(shape) : ''
    const haystack = `${shape.name}\n${text}`.toLowerCase()
    if (needle.length > 0 && !haystack.includes(needle)) continue
    total += 1
    if (matches.length >= max) continue
    matches.push({
      shape,
      ...(frameOf(page, shape) === undefined ? {} : { frameName: frameOf(page, shape)?.name }),
      text,
    })
  }
  matches.sort((left, right) => left.shape.y - right.shape.y || left.shape.x - right.shape.x)
  return { matches, total }
}

/** Render search hits. */
export function renderFind(page: PenpotPage, query: string, type: string | undefined, limit: number): string {
  const { matches, total } = findShapes(page, query, type, limit)
  const lines: string[] = [`# Search “${query}”${type === undefined ? '' : ` · type ${type}`} in ${page.name} (${page.id})`]
  if (total === 0) return `${lines.join('\n')}\nNo matching shapes.`
  for (const match of matches) {
    const shape = match.shape
    const frame = match.frameName === undefined ? '' : ` · frame ${match.frameName}`
    const text = match.text.trim().replace(/\s+/g, ' ')
    lines.push(`[${shape.type}] ${shape.name.length === 0 ? '(unnamed)' : shape.name}${text.length === 0 ? '' : ` — "${truncate(text, 100)}"`} · ${String(round(shape.width))}×${String(round(shape.height))} at ${String(round(shape.x))},${String(round(shape.y))}${frame} · #${shape.id}`)
  }
  if (total > matches.length) lines.push(`… showing ${String(matches.length)} of ${String(total)} matches; raise limit to see more.`)
  return lines.join('\n')
}

/** Normalize a Penpot color to uppercase hex when possible. */
export function normalizeColor(value: string): string {
  const color = value.trim()
  if (/^#[0-9a-fA-F]{3}$/u.test(color)) {
    return `#${color.slice(1).split('').map((part) => `${part}${part}`).join('').toUpperCase()}`
  }
  if (/^#[0-9a-fA-F]{6,8}$/u.test(color)) return color.toUpperCase()
  return color
}

/** A color used by shapes. */
export interface ColorToken {
  value: string
  count: number
  usages: string[]
}

/** A typography combination used by text shapes. */
export interface TypographyToken {
  fontFamily: string
  fontSize: number
  fontWeight: number
  lineHeight?: string
  letterSpacing?: string
  count: number
  usages: string[]
}

/** A corner radius used by shapes. */
export interface RadiusToken {
  value: number
  count: number
  usages: string[]
}

/** Tokens derived from the shapes actually used on a page. */
export interface UsedTokens {
  colors: ColorToken[]
  typography: TypographyToken[]
  radii: RadiusToken[]
}

/** Collect colors, typography and radii actually used on a page. */
export function collectUsedTokens(page: PenpotPage): UsedTokens {
  const colors = new Map<string, { count: number; usages: Set<string> }>()
  const typography = new Map<string, TypographyToken>()
  const radii = new Map<number, { count: number; usages: Set<string> }>()
  const addColor = (value: string, usage: string): void => {
    const normalized = normalizeColor(value)
    if (normalized.length === 0) return
    const entry = colors.get(normalized) ?? { count: 0, usages: new Set<string>() }
    entry.count += 1
    entry.usages.add(usage)
    colors.set(normalized, entry)
  }
  for (const shape of Object.values(page.objects)) {
    if (shape.id === ROOT_ID) continue
    const usage = shape.name.length === 0 ? shape.type : shape.name
    for (const fill of asArray(shape.fills)) {
      if (!isRecord(fill)) continue
      const value = stringValue(fill['fillColor'])
      if (value !== undefined) addColor(value, usage)
    }
    for (const stroke of asArray(shape.strokes)) {
      if (!isRecord(stroke)) continue
      const value = stringValue(stroke['strokeColor'])
      if (value !== undefined) addColor(value, usage)
    }
    for (const run of textRuns(shape)) {
      if (run.fillColor !== undefined) addColor(run.fillColor, usage)
      const key = [run.fontFamily ?? 'Inter', String(run.fontSize), String(run.fontWeight), run.lineHeight ?? '', run.letterSpacing ?? ''].join('|')
      const entry = typography.get(key) ?? {
        fontFamily: run.fontFamily ?? 'Inter',
        fontSize: run.fontSize,
        fontWeight: run.fontWeight,
        ...(run.lineHeight === undefined ? {} : { lineHeight: run.lineHeight }),
        ...(run.letterSpacing === undefined ? {} : { letterSpacing: run.letterSpacing }),
        count: 0,
        usages: [],
      }
      entry.count += 1
      if (!entry.usages.includes(usage)) entry.usages.push(usage)
      typography.set(key, entry)
    }
    const radius = Math.max(...[shape.r1, shape.r2, shape.r3, shape.r4].map((value) => numberValue(value)))
    if (radius > 0) {
      const entry = radii.get(radius) ?? { count: 0, usages: new Set<string>() }
      entry.count += 1
      entry.usages.add(usage)
      radii.set(radius, entry)
    }
  }
  const usagesOf = (set: Set<string>): string[] => [...set].slice(0, 5)
  return {
    colors: [...colors.entries()]
      .map(([value, entry]) => ({ value, count: entry.count, usages: usagesOf(entry.usages) }))
      .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value)),
    typography: [...typography.values()]
      .sort((left, right) => right.count - left.count || left.fontSize - right.fontSize || left.fontFamily.localeCompare(right.fontFamily))
      .map((entry) => ({ ...entry, usages: entry.usages.slice(0, 5) })),
    radii: [...radii.entries()]
      .map(([value, entry]) => ({ value, count: entry.count, usages: usagesOf(entry.usages) }))
      .sort((left, right) => right.count - left.count || left.value - right.value),
  }
}

/** A flattened design token from Penpot's token library. */
export interface LibraryToken {
  path: string
  set: string
  type?: string
  value: unknown
  resolved: unknown
  description?: string
}

/** A token set summary. */
export interface LibrarySet {
  name: string
  count: number
  active: boolean
}

/** A token theme summary. */
export interface LibraryTheme {
  name: string
  group: string
  active: boolean
}

/** The active portion of a file's token library. */
export interface TokenLibrary {
  sets: LibrarySet[]
  themes: LibraryTheme[]
  activeSets: string[]
  activeThemes: string[]
  tokens: LibraryToken[]
  total: number
  truncated: boolean
}

const flattenTokenSet = (setName: string, value: unknown): Array<Omit<LibraryToken, 'resolved'>> => {
  const tokens: Array<Omit<LibraryToken, 'resolved'>> = []
  const walk = (node: unknown, path: string[], inheritedType: string | undefined): void => {
    if (!isRecord(node)) return
    if ('$value' in node) {
      const type = stringValue(node['$type']) ?? inheritedType
      const description = stringValue(node['$description'])
      tokens.push({
        path: path.join('.'),
        set: setName,
        ...(type === undefined ? {} : { type }),
        value: node['$value'],
        ...(description === undefined ? {} : { description }),
      })
      return
    }
    const nextType = stringValue(node['$type']) ?? inheritedType
    for (const [key, child] of Object.entries(node)) {
      if (key.startsWith('$')) continue
      walk(child, [...path, key], nextType)
    }
  }
  walk(value, [], undefined)
  return tokens
}

const activeMetadata = (library: Record<string, unknown>): { sets: string[]; themes: string[] } => {
  const metadata = isRecord(library['$metadata']) ? library['$metadata'] : undefined
  const sets = asArray(metadata?.['activeSets']).filter((value): value is string => typeof value === 'string')
  const themes = asArray(metadata?.['activeThemes']).filter((value): value is string => typeof value === 'string')
  return { sets, themes }
}

const resolveAlias = (value: unknown, lookup: Map<string, unknown>, depth = 0): unknown => {
  if (depth > 12) return value
  if (typeof value !== 'string') return value
  const exact = /^\{([^{}]+)\}$/u.exec(value)
  if (exact?.[1] !== undefined) {
    const target = lookup.get(exact[1])
    return target === undefined ? value : resolveAlias(target, lookup, depth + 1)
  }
  return value.replace(/\{([^{}]+)\}/gu, (match, path: string) => {
    const target = lookup.get(path)
    return target === undefined ? match : String(resolveAlias(target, lookup, depth + 1))
  })
}

/** Read the active tokens from a file's token library, resolving aliases. */
export function readTokenLibrary(library: Record<string, unknown> | undefined, limit = 300): TokenLibrary | undefined {
  if (library === undefined) return undefined
  const sets = Object.entries(library)
    .filter(([name]) => !name.startsWith('$'))
    .map(([name, value]) => ({ name, value, tokens: flattenTokenSet(name, value) }))
  const metadata = activeMetadata(library)
  const activeSets = metadata.sets.length > 0 ? metadata.sets : sets.map((set) => set.name)
  const activeSetNames = new Set(activeSets)
  const themes = asArray(library['$themes'])
    .filter(isRecord)
    .map((theme) => ({
      name: stringValue(theme['name']) ?? '',
      group: stringValue(theme['group']) ?? '',
      active: metadata.themes.includes(`${stringValue(theme['group']) ?? ''}/${stringValue(theme['name']) ?? ''}`),
    }))
  const all = sets.flatMap((set) => set.tokens)
  const lookup = new Map<string, unknown>()
  for (const token of all) lookup.set(token.path, token.value)
  // Active sets are applied in order; a later set wins a duplicate path.
  const tokensBySet = new Map(sets.map((set) => [set.name, set.tokens]))
  const activeByPath = new Map<string, Omit<LibraryToken, 'resolved'>>()
  for (const setName of activeSets) {
    for (const token of tokensBySet.get(setName) ?? []) activeByPath.set(token.path, token)
  }
  const resolved = [...activeByPath.values()].map((token) => ({
    ...token,
    resolved: resolveAlias(token.value, lookup),
  }))
  const max = Math.max(1, Math.min(2000, Math.floor(limit)))
  return {
    sets: sets.map((set) => ({ name: set.name, count: set.tokens.length, active: activeSetNames.has(set.name) })),
    themes,
    activeSets,
    activeThemes: metadata.themes,
    tokens: resolved.slice(0, max),
    total: resolved.length,
    truncated: resolved.length > max,
  }
}

/** Evaluate a Penpot token math expression such as `8*1.25*1.25`. */
function evaluateExpression(input: string): number | undefined {
  if (!/^[0-9+\-*/().\s]+$/u.test(input)) return undefined
  const tokens = input.match(/(?:\d+(?:\.\d+)?|\.\d+)|[()+\-*/]/gu)
  if (tokens === null) return undefined
  let index = 0
  const peek = (): string | undefined => tokens[index]
  const parseFactor = (): number | undefined => {
    const token = peek()
    if (token === undefined) return undefined
    if (token === '(') {
      index += 1
      const value = parseExpression()
      if (peek() !== ')') return undefined
      index += 1
      return value
    }
    if (token === '+') {
      index += 1
      return parseFactor()
    }
    if (token === '-') {
      index += 1
      const value = parseFactor()
      return value === undefined ? undefined : -value
    }
    const value = Number(token)
    if (!Number.isFinite(value)) return undefined
    index += 1
    return value
  }
  const parseTerm = (): number | undefined => {
    let value = parseFactor()
    if (value === undefined) return undefined
    while (peek() === '*' || peek() === '/') {
      const operator = tokens[index]
      index += 1
      const right = parseFactor()
      if (right === undefined) return undefined
      value = operator === '*' ? value * right : value / right
    }
    return value
  }
  const parseExpression = (): number | undefined => {
    let value = parseTerm()
    if (value === undefined) return undefined
    while (peek() === '+' || peek() === '-') {
      const operator = tokens[index]
      index += 1
      const right = parseTerm()
      if (right === undefined) return undefined
      value = operator === '+' ? value + right : value - right
    }
    return value
  }
  const value = parseExpression()
  return index === tokens.length && value !== undefined ? value : undefined
}

const PIXEL_TOKEN_TYPES = new Set(['fontSizes', 'sizing', 'spacing', 'borderRadius', 'dimensions'])

/** Render a token value as a CSS literal, resolving simple Penpot math. */
const cssTokenValue = (token: LibraryToken): string | undefined => {
  if (typeof token.resolved === 'object' && token.resolved !== null) return undefined
  if (typeof token.resolved === 'number') {
    return PIXEL_TOKEN_TYPES.has(token.type ?? '') ? `${String(token.resolved)}px` : String(token.resolved)
  }
  if (typeof token.resolved !== 'string') return undefined
  const evaluated = evaluateExpression(token.resolved)
  if (evaluated !== undefined) {
    return PIXEL_TOKEN_TYPES.has(token.type ?? '') ? `${String(evaluated)}px` : String(evaluated)
  }
  return token.resolved
}

/** Render one token value compactly. */
const tokenValue = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

/** Render CSS custom properties from the token library and used tokens. */
export function renderTokensCss(library: TokenLibrary | undefined, used: UsedTokens): string {
  const lines: string[] = [':root {']
  if (library !== undefined) {
    lines.push('  /* Penpot token library (active sets) */')
    for (const token of library.tokens) {
      const name = token.path.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '')
      if (name.length === 0) continue
      const value = cssTokenValue(token)
      if (value === undefined) {
        lines.push(`  /* ${name}: ${tokenValue(token.resolved)} (${token.type ?? 'composite'}; use JSON) */`)
        continue
      }
      lines.push(`  --${name}: ${value};${token.type === undefined ? '' : ` /* ${token.type} */`}`)
    }
  }
  lines.push('  /* Colors used on this page */')
  for (const [index, color] of used.colors.entries()) {
    lines.push(`  --penpot-color-${String(index + 1)}: ${color.value}; /* ${String(color.count)} use${color.count === 1 ? '' : 's'} */`)
  }
  lines.push('  /* Typography used on this page */')
  for (const [index, typography] of used.typography.entries()) {
    lines.push(`  --penpot-font-${String(index + 1)}: ${typography.fontFamily}, ${String(round(typography.fontSize))}px, ${String(typography.fontWeight)};`)
  }
  lines.push('  /* Corner radii used on this page */')
  for (const [index, radius] of used.radii.entries()) {
    lines.push(`  --penpot-radius-${String(index + 1)}: ${String(round(radius.value))}px;`)
  }
  lines.push('}')
  return lines.join('\n')
}

/** Audit issue severity. */
export type AuditSeverity = 'high' | 'medium' | 'low'

/** One design QA finding. */
export interface AuditIssue {
  severity: AuditSeverity
  rule: string
  message: string
  shapeId?: string
  shapeName?: string
  frameName?: string
}

const parseHex = (value: string): { r: number; g: number; b: number } | undefined => {
  const color = normalizeColor(value)
  if (/^#[0-9A-F]{6}$/u.test(color)) {
    return {
      r: Number.parseInt(color.slice(1, 3), 16),
      g: Number.parseInt(color.slice(3, 5), 16),
      b: Number.parseInt(color.slice(5, 7), 16),
    }
  }
  if (/^#[0-9A-F]{8}$/u.test(color)) {
    return {
      r: Number.parseInt(color.slice(1, 3), 16),
      g: Number.parseInt(color.slice(3, 5), 16),
      b: Number.parseInt(color.slice(5, 7), 16),
    }
  }
  return undefined
}

const luminance = (color: { r: number; g: number; b: number }): number => {
  const channel = (value: number): number => {
    const normalized = value / 255
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
}

/** WCAG contrast ratio, or undefined for non-hex colors. */
export function contrastRatio(foreground: string, background: string): number | undefined {
  const front = parseHex(foreground)
  const back = parseHex(background)
  if (front === undefined || back === undefined) return undefined
  const light = Math.max(luminance(front), luminance(back))
  const dark = Math.min(luminance(front), luminance(back))
  return (light + 0.05) / (dark + 0.05)
}

const isLargeText = (run: TextRun): boolean =>
  run.fontSize >= 24 || (run.fontSize >= 18.66 && run.fontWeight >= 600)

const backgroundFor = (page: PenpotPage, shape: PenpotShape): string | undefined => {
  let current: PenpotShape | undefined = shape
  for (let depth = 0; depth < 8 && current !== undefined; depth += 1) {
    const parentId: string | undefined = current.parentId
    if (parentId === undefined || parentId === ROOT_ID) break
    const parent: PenpotShape | undefined = page.objects[parentId]
    if (parent === undefined) break
    const siblings = childrenOf(page, parentId)
    const index = siblings.findIndex((item) => item.id === shape.id)
    const before = index >= 0 ? siblings.slice(0, index).reverse() : siblings.slice().reverse()
    const center = { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 }
    for (const candidate of before) {
      const fill = asArray(candidate.fills).find(isRecord)
      if (fill === undefined) continue
      const color = stringValue(fill['fillColor'])
      if (color === undefined) continue
      const opacity = numberValue(fill['fillOpacity'], 1)
      if (opacity < 0.9) continue
      if (center.x < candidate.x || center.x > candidate.x + candidate.width) continue
      if (center.y < candidate.y || center.y > candidate.y + candidate.height) continue
      return color
    }
    if (parent.type === 'frame') {
      const fill = asArray(parent.fills).find(isRecord)
      if (fill !== undefined) {
        const color = stringValue(fill['fillColor'])
        if (color !== undefined) return color
      }
      break
    }
    current = parent
  }
  return undefined
}

/** Audit one page for typography and accessibility problems. */
export function auditPage(page: PenpotPage): AuditIssue[] {
  const issues: AuditIssue[] = []
  const frameName = (shape: PenpotShape): string | undefined => frameOf(page, shape)?.name
  const push = (issue: AuditIssue): void => {
    issues.push(issue)
  }
  for (const shape of Object.values(page.objects)) {
    if (shape.id === ROOT_ID) continue
    if (shape.type === 'frame' && childrenOf(page, shape.id).length === 0) {
      push({ severity: 'low', rule: 'empty-frame', message: 'Frame has no layers.', shapeId: shape.id, shapeName: shape.name, ...(frameName(shape) === undefined ? {} : { frameName: frameName(shape) }) })
    }
    if (shape.type !== 'text') continue
    const runs = textRuns(shape)
    if (runs.length === 0) continue
    const frame = frameName(shape)
    const base = { ...(shape.name.length === 0 ? {} : { shapeName: shape.name }), ...(frame === undefined ? {} : { frameName: frame }) }
    for (const run of runs) {
      if (run.fontSize < 12) {
        push({ severity: 'medium', rule: 'small-text', message: `Text is ${String(round(run.fontSize))}px; 12px is the practical minimum.`, shapeId: shape.id, ...base })
      }
    }
    const firstRun = runs[0]
    const textColor = firstRun?.fillColor
    if (textColor !== undefined) {
      const background = backgroundFor(page, shape) ?? '#FFFFFF'
      const ratio = contrastRatio(textColor, background)
      if (ratio !== undefined) {
        const threshold = firstRun !== undefined && isLargeText(firstRun) ? 3 : 4.5
        if (ratio < threshold) {
          push({
            severity: 'high',
            rule: 'low-contrast',
            message: `Contrast ${ratio.toFixed(2)}:1 (${normalizeColor(textColor)} on ${normalizeColor(background)}); needs ${String(threshold)}:1.`,
            shapeId: shape.id,
            ...base,
          })
        }
      }
    }
    const text = shapeText(shape)
    for (const entry of asArray(shape.positionData)) {
      if (!isRecord(entry)) continue
      // `positionData` is baseline-based, so its y/height cannot be compared
      // with the box. Width is reliable and catches the common case: a fixed
      // text box narrower than its line.
      const right = numberValue(entry['x']) + numberValue(entry['width'])
      if (right > shape.x + shape.width + 1) {
        push({
          severity: 'medium',
          rule: 'text-overflow',
          message: `Text “${truncate(text.replace(/\s+/gu, ' '), 60)}” is wider than its ${String(round(shape.width))}px box.`,
          shapeId: shape.id,
          ...base,
        })
        break
      }
    }
  }
  const byParent = new Map<string, Map<string, PenpotShape[]>>()
  for (const shape of Object.values(page.objects)) {
    if (shape.id === ROOT_ID || shape.name.length === 0) continue
    const parentId = shape.parentId ?? ROOT_ID
    const names = byParent.get(parentId) ?? new Map<string, PenpotShape[]>()
    const group = names.get(shape.name) ?? []
    group.push(shape)
    names.set(shape.name, group)
    byParent.set(parentId, names)
  }
  for (const [parentId, names] of byParent) {
    for (const [name, shapes] of names) {
      if (shapes.length < 2) continue
      push({ severity: 'low', rule: 'duplicate-name', message: `${String(shapes.length)} layers named “${name}” under the same parent.`, shapeId: shapes[0]?.id, shapeName: name, ...(parentId === ROOT_ID ? {} : { frameName: page.objects[parentId]?.name }) })
    }
  }
  const order: Record<AuditSeverity, number> = { high: 0, medium: 1, low: 2 }
  return issues.sort((left, right) => order[left.severity] - order[right.severity])
}

/** Render an audit report. */
export function renderAudit(page: PenpotPage, issues: AuditIssue[]): string {
  const lines: string[] = [`# Design audit — ${page.name} (${page.id})`]
  if (issues.length === 0) {
    lines.push('No typography or accessibility issues found by the current rules.')
    return lines.join('\n')
  }
  const counts: Record<AuditSeverity, number> = { high: 0, medium: 0, low: 0 }
  for (const issue of issues) counts[issue.severity] += 1
  lines.push(`${String(issues.length)} issue${issues.length === 1 ? '' : 's'}: ${String(counts.high)} high, ${String(counts.medium)} medium, ${String(counts.low)} low`)
  for (const severity of ['high', 'medium', 'low'] as const) {
    const bucket = issues.filter((issue) => issue.severity === severity)
    if (bucket.length === 0) continue
    lines.push('')
    lines.push(severity.toUpperCase())
    for (const issue of bucket) {
      const location = [issue.frameName, issue.shapeName].filter((part): part is string => part !== undefined && part.length > 0).join(' / ')
      lines.push(`- ${issue.rule}: ${issue.message}${location.length === 0 ? '' : ` (${location})`}${issue.shapeId === undefined ? '' : ` #${issue.shapeId}`}`)
    }
  }
  return lines.join('\n')
}

/** Render a token report as JSON or CSS. */
export function renderTokens(file: PenpotFileData, page: PenpotPage | undefined, format: 'json' | 'css'): string {
  const library = readTokenLibrary(file.data.tokensLib)
  const used = page === undefined ? { colors: [], typography: [], radii: [] } : collectUsedTokens(page)
  if (format === 'css') return renderTokensCss(library, used)
  const payload = {
    file: { id: file.id, name: file.name, revn: file.revn },
    ...(page === undefined ? {} : { page: { id: page.id, name: page.name } }),
    ...(library === undefined ? {} : { library }),
    used,
  }
  return JSON.stringify(payload, null, 2)
}
