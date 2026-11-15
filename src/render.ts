/**
 * Best-effort SVG rendering for a Penpot frame.
 *
 * This is deliberately not Penpot's renderer. It covers the shapes the plugin
 * can create (frames, rects, circles, text and groups) plus solid fills,
 * strokes, radii and simple image placeholders. Gradients, masks, shadows,
 * booleans, paths and component expansion are outside the initial contract.
 *
 * @module dsh-penpot-plugin/render
 */

import { childrenOf, shapeText, textRuns } from './design.js'
import type { PenpotPage, PenpotShape } from './backend.js'

/** A rendered frame plus the information a caller needs to report fidelity. */
export interface FrameRender {
  svg: string
  width: number
  height: number
  /** Things that were omitted or replaced by a placeholder. */
  limitations: string[]
}

const escapeXml = (value: string): string => value
  .replace(/&/gu, '&amp;')
  .replace(/</gu, '&lt;')
  .replace(/>/gu, '&gt;')
  .replace(/"/gu, '&quot;')
  .replace(/'/gu, '&apos;')

const number = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

const solidFill = (shape: PenpotShape): string | undefined => {
  const fills = Array.isArray(shape.fills) ? shape.fills : []
  for (const fill of fills) {
    if (fill === null || typeof fill !== 'object') continue
    const color = (fill as Record<string, unknown>)['fillColor']
    if (typeof color === 'string') return color
  }
  return undefined
}

const stroke = (shape: PenpotShape): { color: string; width: number } | undefined => {
  const strokes = Array.isArray(shape.strokes) ? shape.strokes : []
  for (const value of strokes) {
    if (value === null || typeof value !== 'object') continue
    const color = (value as Record<string, unknown>)['strokeColor']
    if (typeof color === 'string') return { color, width: number((value as Record<string, unknown>)['strokeWidth'], 1) }
  }
  return undefined
}

const opacity = (shape: PenpotShape): number => Math.max(0, Math.min(1, number(shape.opacity, 1)))

const textAnchor = (align: unknown): string =>
  align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start'

const fontStack = (family: string): string => family.includes(',') ? family : `${family}, sans-serif`

/** Render one frame to a standalone SVG document. */
export function renderFrameSvg(page: PenpotPage, frameId: string): FrameRender {
  const frame = page.objects[frameId]
  if (frame === undefined) throw new Error(`frame ${frameId} is not on page ${page.id}`)
  if (frame.type !== 'frame') throw new Error(`shape ${frameId} is ${frame.type}, not a frame`)
  const offsetX = frame.x
  const offsetY = frame.y
  const limitations = new Set<string>()
  const body: string[] = []
  const pushShape = (shape: PenpotShape, indent: string): void => {
    const x = shape.x - offsetX
    const y = shape.y - offsetY
    const opacityValue = opacity(shape)
    const opacityAttr = opacityValue < 1 ? ` opacity="${String(opacityValue)}"` : ''
    if (shape.type === 'frame' || shape.type === 'group') {
      const fill = solidFill(shape)
      const border = stroke(shape)
      if (shape.type === 'frame' && fill !== undefined) {
        body.push(`${indent}<rect x="${String(x)}" y="${String(y)}" width="${String(shape.width)}" height="${String(shape.height)}" fill="${escapeXml(fill)}"${opacityAttr}/>`)
      }
      if (shape.type === 'group' && border !== undefined) {
        body.push(`${indent}<rect x="${String(x)}" y="${String(y)}" width="${String(shape.width)}" height="${String(shape.height)}" fill="none" stroke="${escapeXml(border.color)}" stroke-width="${String(border.width)}"/>`)
      }
      body.push(`${indent}<g${opacityAttr}>`)
      for (const child of childrenOf(page, shape.id)) pushShape(child, `${indent}  `)
      body.push(`${indent}</g>`)
      return
    }
    if (shape.type === 'rect') {
      const fill = solidFill(shape) ?? '#E5E7EB'
      const border = stroke(shape)
      const radius = Math.max(0, number(shape.r1))
      body.push(`${indent}<rect x="${String(x)}" y="${String(y)}" width="${String(shape.width)}" height="${String(shape.height)}" rx="${String(radius)}" ry="${String(radius)}" fill="${escapeXml(fill)}"${border === undefined ? '' : ` stroke="${escapeXml(border.color)}" stroke-width="${String(border.width)}"`}${opacityAttr}/>`)
      return
    }
    if (shape.type === 'circle') {
      const fill = solidFill(shape) ?? '#E5E7EB'
      const border = stroke(shape)
      body.push(`${indent}<ellipse cx="${String(x + shape.width / 2)}" cy="${String(y + shape.height / 2)}" rx="${String(shape.width / 2)}" ry="${String(shape.height / 2)}" fill="${escapeXml(fill)}"${border === undefined ? '' : ` stroke="${escapeXml(border.color)}" stroke-width="${String(border.width)}"`}${opacityAttr}/>`)
      return
    }
    if (shape.type === 'text') {
      const runs = textRuns(shape)
      const first = runs[0]
      const entries = Array.isArray(shape.positionData) ? shape.positionData : []
      body.push(`${indent}<g${opacityAttr}>`)
      if (entries.length > 0) {
        for (const entry of entries) {
          if (entry === null || typeof entry !== 'object') continue
          const record = entry as Record<string, unknown>
          const text = typeof record['text'] === 'string' ? record['text'] : ''
          if (text.length === 0) continue
          const fontSize = number(record['fontSize'], first?.fontSize ?? 14)
          const fontFamily = typeof record['fontFamily'] === 'string' ? record['fontFamily'] : first?.fontFamily ?? 'Inter'
          const fontWeight = record['fontWeight'] ?? first?.fontWeight ?? 400
          const fill = Array.isArray(record['fills']) && record['fills'][0] !== undefined
            ? String((record['fills'][0] as Record<string, unknown>)['fillColor'] ?? first?.fillColor ?? '#111827')
            : first?.fillColor ?? '#111827'
          const anchor = textAnchor(record['textAlign'])
          const boxX = number(record['x']) - offsetX
          const boxWidth = number(record['width'], shape.width)
          const textX = anchor === 'middle' ? boxX + boxWidth / 2 : anchor === 'end' ? boxX + boxWidth : boxX
          body.push(`${indent}  <text x="${String(textX)}" y="${String(number(record['y']) - offsetY)}" font-family="${escapeXml(fontStack(fontFamily))}" font-size="${String(fontSize)}" font-weight="${String(fontWeight)}" fill="${escapeXml(fill)}" text-anchor="${anchor}">${escapeXml(text)}</text>`)
        }
      } else if (first !== undefined) {
        const text = shapeText(shape)
        const xText = x + (first.textAlign === 'center' ? shape.width / 2 : first.textAlign === 'right' ? shape.width : 0)
        body.push(`${indent}  <text x="${String(xText)}" y="${String(y + first.fontSize)}" font-family="${escapeXml(fontStack(first.fontFamily ?? 'Inter'))}" font-size="${String(first.fontSize)}" font-weight="${String(first.fontWeight)}" fill="${escapeXml(first.fillColor ?? '#111827')}" text-anchor="${textAnchor(first.textAlign)}">${escapeXml(text)}</text>`)
      }
      body.push(`${indent}</g>`)
      return
    }
    if (shape.type === 'image') {
      limitations.add('image bytes are not rendered; a placeholder is drawn')
      body.push(`${indent}<rect x="${String(x)}" y="${String(y)}" width="${String(shape.width)}" height="${String(shape.height)}" fill="#E5E7EB"${opacityAttr}/>`)
      body.push(`${indent}<text x="${String(x + shape.width / 2)}" y="${String(y + shape.height / 2)}" font-family="sans-serif, sans-serif" font-size="12" fill="#6B7280" text-anchor="middle">image</text>`)
      return
    }
    limitations.add(`${shape.type} shapes are not rendered`)
  }
  for (const child of childrenOf(page, frame.id)) pushShape(child, '  ')
  const width = Math.max(1, frame.width)
  const height = Math.max(1, frame.height)
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}" viewBox="0 0 ${String(width)} ${String(height)}">`,
    `  <rect x="0" y="0" width="${String(width)}" height="${String(height)}" fill="${escapeXml(solidFill(frame) ?? '#FFFFFF')}"/>`,
    ...body,
    '</svg>',
  ].join('\n')
  return { svg, width, height, limitations: [...limitations] }
}
