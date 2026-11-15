/**
 * Shape builders for Penpot's `update-file` change format.
 *
 * The HTTP API validates every shape against Penpot's own schema, so these
 * builders intentionally produce the small required core (identity, geometry,
 * transform, parent links) plus the fields a screen needs: fills, radii and
 * text. Anything more type-specific should come from an existing shape in the
 * target file.
 *
 * @module dsh-penpot-plugin/shapes
 */

import { textRuns } from './design.js'
import type { PenpotMedia, PenpotShape } from './backend.js'

/** Penpot's root object/frame sentinel. */
export const ROOT_ID = '00000000-0000-0000-0000-000000000000'

/** A solid fill in Penpot's client shape format. */
export interface SolidFill {
  fillColor: string
  fillOpacity: number
}

/** Text styling accepted by the add/update text tools. */
export interface TextStyle {
  fontFamily?: string
  fontSize?: number
  fontWeight?: number
  lineHeight?: number
  letterSpacing?: number
  color?: string
  textAlign?: 'left' | 'right' | 'center' | 'justify'
}

/** Required text style after defaults. */
export interface ResolvedTextStyle {
  fontFamily: string
  fontSize: number
  fontWeight: number
  lineHeight: number
  letterSpacing: number
  color: string
  textAlign: 'left' | 'right' | 'center' | 'justify'
}

const solid = (fill: string): SolidFill => ({ fillColor: fill, fillOpacity: 1 })

const rect = (x: number, y: number, width: number, height: number): Record<string, number> => ({
  x,
  y,
  width,
  height,
  x1: x,
  y1: y,
  x2: x + width,
  y2: y + height,
})

const points = (x: number, y: number, width: number, height: number): Array<{ x: number; y: number }> => [
  { x, y },
  { x: x + width, y },
  { x: x + width, y: y + height },
  { x, y: y + height },
]

const matrix = (): Record<string, number> => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })

const common = (input: {
  id: string
  name: string
  type: string
  pageId: string
  parentId: string
  frameId: string
  x: number
  y: number
  width: number
  height: number
}): Record<string, unknown> => ({
  id: input.id,
  name: input.name,
  type: input.type,
  x: input.x,
  y: input.y,
  width: input.width,
  height: input.height,
  rotation: 0,
  selrect: rect(input.x, input.y, input.width, input.height),
  points: points(input.x, input.y, input.width, input.height),
  transform: matrix(),
  transformInverse: matrix(),
  parentId: input.parentId,
  frameId: input.frameId,
  pageId: input.pageId,
})

/** Create a top-level frame (an artboard). */
export function createFrame(input: {
  id: string
  name: string
  pageId: string
  x: number
  y: number
  width: number
  height: number
  fill?: string
  radius?: number
  opacity?: number
}): PenpotShape {
  const radius = Math.max(0, input.radius ?? 0)
  return {
    ...common({
      id: input.id,
      name: input.name,
      type: 'frame',
      pageId: input.pageId,
      parentId: ROOT_ID,
      frameId: ROOT_ID,
      x: input.x,
      y: input.y,
      width: input.width,
      height: input.height,
    }),
    shapes: [],
    fills: [solid(input.fill ?? '#FFFFFF')],
    strokes: [],
    hideFillOnExport: false,
    proportion: 1,
    proportionLock: false,
    ...(radius > 0 ? { r1: radius, r2: radius, r3: radius, r4: radius } : {}),
    ...(input.opacity === undefined ? {} : { opacity: input.opacity }),
  } as unknown as PenpotShape
}

/** Create a rectangle inside a frame (or another container). */
export function createRect(input: {
  id: string
  name: string
  pageId: string
  frameId: string
  x: number
  y: number
  width: number
  height: number
  fill?: string
  radius?: number
  opacity?: number
}): PenpotShape {
  const radius = Math.max(0, input.radius ?? 0)
  return {
    ...common({
      id: input.id,
      name: input.name,
      type: 'rect',
      pageId: input.pageId,
      parentId: input.frameId,
      frameId: input.frameId,
      x: input.x,
      y: input.y,
      width: input.width,
      height: input.height,
    }),
    fills: [solid(input.fill ?? '#E5E7EB')],
    strokes: [],
    proportion: 1,
    ...(radius > 0 ? { r1: radius, r2: radius, r3: radius, r4: radius } : {}),
    ...(input.opacity === undefined ? {} : { opacity: input.opacity }),
  } as unknown as PenpotShape
}

/** Create a group around existing child ids. */
export function createGroup(input: {
  id: string
  name: string
  pageId: string
  frameId: string
  childIds: string[]
  bounds: { x: number; y: number; width: number; height: number }
}): PenpotShape {
  return {
    ...common({
      id: input.id,
      name: input.name,
      type: 'group',
      pageId: input.pageId,
      parentId: input.frameId,
      frameId: input.frameId,
      x: input.bounds.x,
      y: input.bounds.y,
      width: input.bounds.width,
      height: input.bounds.height,
    }),
    shapes: input.childIds,
    strokes: [],
  } as unknown as PenpotShape
}

/** Create an image shape referencing a file media object. */
export function createImage(input: {
  id: string
  name: string
  pageId: string
  frameId: string
  x: number
  y: number
  width: number
  height: number
  media: PenpotMedia
}): PenpotShape {
  return {
    ...common({
      id: input.id,
      name: input.name,
      type: 'image',
      pageId: input.pageId,
      parentId: input.frameId,
      frameId: input.frameId,
      x: input.x,
      y: input.y,
      width: input.width,
      height: input.height,
    }),
    metadata: {
      id: input.media.id,
      width: input.media.width,
      height: input.media.height,
      ...(input.media.mtype === undefined ? {} : { mtype: input.media.mtype }),
    },
    strokes: [],
  } as unknown as PenpotShape
}

/** Create a circle inside a frame. */
export function createCircle(input: {
  id: string
  name: string
  pageId: string
  frameId: string
  x: number
  y: number
  width: number
  height: number
  fill?: string
  opacity?: number
}): PenpotShape {
  return {
    ...common({
      id: input.id,
      name: input.name,
      type: 'circle',
      pageId: input.pageId,
      parentId: input.frameId,
      frameId: input.frameId,
      x: input.x,
      y: input.y,
      width: input.width,
      height: input.height,
    }),
    fills: [solid(input.fill ?? '#E5E7EB')],
    strokes: [],
    proportion: 1,
    ...(input.opacity === undefined ? {} : { opacity: input.opacity }),
  } as unknown as PenpotShape
}

/** Resolve optional text style values. */
export function resolveTextStyle(style: TextStyle = {}): ResolvedTextStyle {
  return {
    fontFamily: style.fontFamily ?? 'Inter',
    fontSize: style.fontSize ?? 14,
    fontWeight: style.fontWeight ?? 400,
    lineHeight: style.lineHeight ?? 1.4,
    letterSpacing: style.letterSpacing ?? 0,
    color: style.color ?? '#111827',
    textAlign: style.textAlign ?? 'left',
  }
}

/** Approximate glyph width in em, used when no font file is available. */
const glyphRatio = (character: string): number => {
  if (/[ilI.,;:'!|]/u.test(character)) return 0.28
  if (/[mwMW@]/u.test(character)) return 0.9
  if (/[A-Z]/u.test(character)) return 0.66
  if (/[0-9]/u.test(character)) return 0.56
  if (character === ' ') return 0.28
  return 0.52
}

/** Estimated rendered width of one line, in page units. */
export function measureTextWidth(text: string, style: TextStyle = {}): number {
  const resolved = resolveTextStyle(style)
  let width = 0
  for (const character of text) width += glyphRatio(character) * resolved.fontSize
  return width + Math.max(0, text.length - 1) * resolved.letterSpacing
}

const splitLongWord = (word: string, width: number, style: TextStyle): string[] => {
  const parts: string[] = []
  let current = ''
  for (const character of word) {
    const candidate = current + character
    if (current.length > 0 && measureTextWidth(candidate, style) > width) {
      parts.push(current)
      current = character
    } else {
      current = candidate
    }
  }
  if (current.length > 0) parts.push(current)
  return parts.length === 0 ? [''] : parts
}

/** Greedy word wrap using the approximate metric; explicit newlines are handled by the caller. */
export function wrapText(text: string, width: number, style: TextStyle = {}): string[] {
  const resolvedWidth = Math.max(1, width)
  const words = text.split(/(\s+)/u)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    if (word.length === 0) continue
    if (current.length === 0) {
      if (measureTextWidth(word, style) <= resolvedWidth) {
        current = word
      } else {
        const chunks = splitLongWord(word, resolvedWidth, style)
        for (let index = 0; index < chunks.length - 1; index += 1) lines.push(chunks[index] ?? '')
        current = chunks[chunks.length - 1] ?? ''
      }
      continue
    }
    if (measureTextWidth(current + word, style) <= resolvedWidth) {
      current += word
      continue
    }
    lines.push(current.trimEnd())
    if (word.trim().length === 0) {
      current = ''
      continue
    }
    if (measureTextWidth(word, style) <= resolvedWidth) {
      current = word
    } else {
      const chunks = splitLongWord(word, resolvedWidth, style)
      for (let index = 0; index < chunks.length - 1; index += 1) lines.push(chunks[index] ?? '')
      current = chunks[chunks.length - 1] ?? ''
    }
  }
  if (current.length > 0 || lines.length === 0) lines.push(current.trimEnd())
  return lines
}

/** Height a text box needs for the explicit lines and the approximate wrap. */
export function textBoxHeight(text: string, style: TextStyle = {}, width = 320, wrap = true): number {
  const resolved = resolveTextStyle(style)
  const paragraphs = text.split(/\r?\n/u)
  const lines = wrap
    ? paragraphs.reduce((count, paragraph) => count + wrapText(paragraph, width, resolved).length, 0)
    : Math.max(1, paragraphs.length)
  return Math.ceil(lines * resolved.fontSize * resolved.lineHeight + resolved.fontSize * 0.4)
}

/**
 * Build Penpot's rich-text tree and line layout for a text shape. The content
 * keeps the original paragraphs; `positionData` carries the approximate wrapped
 * lines. Penpot remains the final layout authority.
 */
export function buildTextContent(
  text: string,
  style: TextStyle,
  input: { x: number; y: number; width: number; height: number },
  wrap = true,
): { content: Record<string, unknown>; positionData: Array<Record<string, unknown>> } {
  const resolved = resolveTextStyle(style)
  const paragraphs = text.split(/\r?\n/u)
  const lineHeight = resolved.fontSize * resolved.lineHeight
  const fontId = `gfont-${resolved.fontFamily.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '')}`
  const spanStyle = {
    fontFamily: resolved.fontFamily,
    fontId,
    fontVariantId: 'regular',
    fontSize: String(resolved.fontSize),
    fontWeight: String(resolved.fontWeight),
    fontStyle: 'normal',
    lineHeight: String(resolved.lineHeight),
    letterSpacing: String(resolved.letterSpacing),
    textTransform: 'none',
    textDecoration: 'none',
    direction: 'ltr',
    fills: [solid(resolved.color)],
  }
  const content = {
    type: 'root',
    children: [{
      type: 'paragraph-set',
      children: paragraphs.map((paragraph) => ({
        type: 'paragraph',
        ...spanStyle,
        textAlign: resolved.textAlign,
        direction: 'ltr',
        children: [{ text: paragraph, ...spanStyle }],
      })),
    }],
  }
  const lines = paragraphs.flatMap((paragraph) => wrap ? wrapText(paragraph, input.width, resolved) : [paragraph])
  const positionData = lines.map((line, index) => ({
    x: input.x,
    y: input.y + resolved.fontSize * 0.2 + index * lineHeight,
    width: input.width,
    height: lineHeight,
    x1: 0,
    y1: 0,
    x2: input.width,
    y2: lineHeight,
    ...spanStyle,
    fontSize: `${String(resolved.fontSize)}px`,
    textAlign: resolved.textAlign,
    text: line,
  }))
  return { content, positionData }
}

/** Create a text shape inside a frame. */
export function createText(input: {
  id: string
  name: string
  pageId: string
  frameId: string
  x: number
  y: number
  width: number
  height?: number
  text: string
  style?: TextStyle
  wrap?: boolean
}): PenpotShape {
  const resolved = resolveTextStyle(input.style)
  const wrap = input.wrap ?? true
  const height = input.height ?? textBoxHeight(input.text, resolved, input.width, wrap)
  const { content, positionData } = buildTextContent(input.text, resolved, {
    x: input.x,
    y: input.y,
    width: input.width,
    height,
  }, wrap)
  return {
    ...common({
      id: input.id,
      name: input.name,
      type: 'text',
      pageId: input.pageId,
      parentId: input.frameId,
      frameId: input.frameId,
      x: input.x,
      y: input.y,
      width: input.width,
      height,
    }),
    growType: 'fixed',
    content,
    positionData,
    constraintsH: 'left',
    constraintsV: 'top',
  } as unknown as PenpotShape
}

/**
 * Rebuild a text shape's content and line layout from new copy, keeping the
 * first run's typography unless the caller overrides it.
 */
export function updateTextShape(
  shape: PenpotShape,
  text: string,
  style: TextStyle = {},
  size: { width?: number; height?: number; wrap?: boolean } = {},
): { content: Record<string, unknown>; positionData: Array<Record<string, unknown>>; width: number; height: number } {
  const runs = textRuns(shape)
  const first = runs[0]
  const inheritedLineHeight = first?.lineHeight === undefined ? undefined : Number.parseFloat(first.lineHeight)
  const inheritedLetterSpacing = first?.letterSpacing === undefined ? undefined : Number.parseFloat(first.letterSpacing)
  const merged: TextStyle = {
    ...(first === undefined
      ? {}
      : {
          fontFamily: first.fontFamily,
          fontSize: first.fontSize,
          fontWeight: first.fontWeight,
          ...(inheritedLineHeight === undefined || !Number.isFinite(inheritedLineHeight) ? {} : { lineHeight: inheritedLineHeight }),
          ...(inheritedLetterSpacing === undefined || !Number.isFinite(inheritedLetterSpacing) ? {} : { letterSpacing: inheritedLetterSpacing }),
          ...(first.fillColor === undefined ? {} : { color: first.fillColor }),
          ...(first.textAlign === undefined ? {} : { textAlign: first.textAlign as TextStyle['textAlign'] }),
        }),
    ...style,
  }
  const resolved = resolveTextStyle(merged)
  const width = size.width ?? shape.width
  const wrap = size.wrap ?? true
  const height = size.height ?? textBoxHeight(text, resolved, width, wrap)
  const { content, positionData } = buildTextContent(text, resolved, {
    x: shape.x,
    y: shape.y,
    width,
    height,
  }, wrap)
  return { content, positionData, width, height }
}
