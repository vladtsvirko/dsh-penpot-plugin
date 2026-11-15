import { describe, expect, it } from 'vitest'
import {
  buildTextContent,
  createCircle,
  createFrame,
  createGroup,
  createImage,
  createRect,
  createText,
  measureTextWidth,
  ROOT_ID,
  textBoxHeight,
  updateTextShape,
  wrapText,
} from '../src/shapes.js'
import type { PenpotShape } from '../src/backend.js'

describe('shape builders', () => {
  it('builds a top-level frame with geometry and parent links', () => {
    const frame = createFrame({ id: 'frame-1', name: 'Screen', pageId: 'page-1', x: 10, y: 20, width: 390, height: 844, fill: '#FFFFFF', radius: 8 })
    expect(frame).toMatchObject({
      id: 'frame-1',
      name: 'Screen',
      type: 'frame',
      x: 10,
      y: 20,
      width: 390,
      height: 844,
      parentId: ROOT_ID,
      frameId: ROOT_ID,
      pageId: 'page-1',
      shapes: [],
      r1: 8,
      r2: 8,
      r3: 8,
      r4: 8,
    })
    expect(frame.selrect).toEqual({ x: 10, y: 20, width: 390, height: 844, x1: 10, y1: 20, x2: 400, y2: 864 })
    expect(frame.points).toHaveLength(4)
  })

  it('builds a rect and a circle inside a frame', () => {
    const rect = createRect({ id: 'rect-1', name: 'Card', pageId: 'page-1', frameId: 'frame-1', x: 24, y: 100, width: 342, height: 132, fill: '#F3F4F6', radius: 12 })
    expect(rect).toMatchObject({ type: 'rect', parentId: 'frame-1', frameId: 'frame-1', pageId: 'page-1', r1: 12 })
    expect(rect.fills).toEqual([{ fillColor: '#F3F4F6', fillOpacity: 1 }])
    const circle = createCircle({ id: 'circle-1', name: 'Avatar', pageId: 'page-1', frameId: 'frame-1', x: 171, y: 452, width: 48, height: 48, fill: '#E6E8EB' })
    expect(circle).toMatchObject({ type: 'circle', parentId: 'frame-1', frameId: 'frame-1', width: 48, height: 48 })
  })

  it('builds text content and one positioned line per explicit newline', () => {
    const text = createText({
      id: 'text-1',
      name: 'Title',
      pageId: 'page-1',
      frameId: 'frame-1',
      x: 24,
      y: 104,
      width: 342,
      text: 'Hello\nWorld',
      style: { fontSize: 24, fontWeight: 600, color: '#111827' },
    })
    expect(text).toMatchObject({ type: 'text', parentId: 'frame-1', frameId: 'frame-1', x: 24, y: 104, width: 342 })
    const content = text.content as { children: Array<{ children: Array<{ children: Array<{ text: string }> }> }> }
    expect(content.children[0]?.children[0]?.children[0]?.text).toBe('Hello')
    expect(content.children[0]?.children[1]?.children[0]?.text).toBe('World')
    expect(text.positionData).toHaveLength(2)
    expect(text.positionData?.[0]).toMatchObject({ x: 24, y: 134, fontSize: '24px', text: 'Hello' })
    expect(text.positionData?.[0]?.width).toBeGreaterThan(0)
    expect(text.height).toBe(textBoxHeight('Hello\nWorld', { fontSize: 24 }))
  })

  it('rebuilds text while preserving first-run typography', () => {
    const original = createText({
      id: 'text-1',
      name: 'Title',
      pageId: 'page-1',
      frameId: 'frame-1',
      x: 24,
      y: 104,
      width: 342,
      text: 'Old',
      style: { fontFamily: 'Inter', fontSize: 22, fontWeight: 600, color: '#111827' },
    })
    const updated = updateTextShape(original, 'A longer replacement')
    expect(updated.content).toMatchObject({ type: 'root' })
    expect(updated.positionData[0]).toMatchObject({ text: 'A longer replacement', fontSize: '22px', fontWeight: '600', fontFamily: 'Inter' })
    expect(updated.height).toBeGreaterThan(0)
    expect(updated.width).toBe(342)
  })

  it('wraps long copy using the approximate metric', () => {
    const text = 'This is a long sentence that should wrap inside a narrow box.'
    const lines = wrapText(text, 180, { fontSize: 14 })
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.every((line) => measureTextWidth(line, { fontSize: 14 }) <= 181)).toBe(true)
    const shape = createText({ id: 't', name: 't', pageId: 'p', frameId: 'f', x: 0, y: 0, width: 180, text, style: { fontSize: 14 } })
    expect(shape.positionData?.length).toBe(lines.length)
  })

  it('can opt out of wrapping', () => {
    const shape = createText({ id: 't', name: 't', pageId: 'p', frameId: 'f', x: 0, y: 0, width: 180, text: 'A long line that must stay one line', wrap: false })
    expect(shape.positionData).toHaveLength(1)
  })

  it('builds image and group shapes', () => {
    const image = createImage({ id: 'i', name: 'Image', pageId: 'p', frameId: 'f', x: 10, y: 20, width: 40, height: 30, media: { id: 'media-1', width: 400, height: 300, mtype: 'image/png' } })
    expect(image).toMatchObject({ type: 'image', parentId: 'f', frameId: 'f', metadata: { id: 'media-1', width: 400, height: 300, mtype: 'image/png' } })
    const group = createGroup({ id: 'g', name: 'Group', pageId: 'p', frameId: 'f', childIds: ['a', 'b'], bounds: { x: 10, y: 10, width: 100, height: 50 } })
    expect(group).toMatchObject({ type: 'group', parentId: 'f', shapes: ['a', 'b'], x: 10, y: 10, width: 100, height: 50 })
  })

  it('builds content without a shape wrapper', () => {
    const { content, positionData } = buildTextContent('One line', { fontSize: 14 }, { x: 10, y: 20, width: 300, height: 24 })
    expect(content).toMatchObject({ type: 'root' })
    expect(positionData[0]).toMatchObject({ x: 10, text: 'One line' })
    expect(positionData[0]?.y).toBeCloseTo(37.5)
    expect(positionData[0]?.width).toBeGreaterThan(0)
  })
})
