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
import type { PenpotShape } from './backend.js'

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

/** Height a text box needs for its explicit lines. */
export function textBoxHeight(text: string, style: TextStyle = {}): number {
  const resolved = resolveTextStyle(style)
  const lines = Math.max(1, text.split(/\r?\n/u).length)
  return Math.ceil(lines * resolved.fontSize * resolved.lineHeight + resolved.fontSize * 0.4)
}

/**
 * Build Penpot's rich-text tree and line layout for a text shape. Explicit
 * newlines become paragraphs; wrapping inside a line is left to Penpot's
 * renderer, so keep the box wide enough for the copy.
 */
export function buildTextContent(
  text: string,
  style: TextStyle,
  input: { x: number; y: number; width: number; height: number },
): { content: Record<string, unknown>; positionData: Array<Record<string, unknown>> } {
  const resolved = resolveTextStyle(style)
  const lines = text.split(/\r?\n/u)
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
      children: lines.map((line) => ({
        type: 'paragraph',
        ...spanStyle,
        textAlign: resolved.textAlign,
        direction: 'ltr',
        children: [{ text: line, ...spanStyle }],
      })),
    }],
  }
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
}): PenpotShape {
  const resolved = resolveTextStyle(input.style)
  const height = input.height ?? textBoxHeight(input.text, resolved)
  const { content, positionData } = buildTextContent(input.text, resolved, {
    x: input.x,
    y: input.y,
    width: input.width,
    height,
  })
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
  size: { width?: number; height?: number } = {},
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
  const height = size.height ?? textBoxHeight(text, resolved)
  const { content, positionData } = buildTextContent(text, resolved, {
    x: shape.x,
    y: shape.y,
    width,
    height,
  })
  return { content, positionData, width, height }
}
