import { describe, expect, it } from 'vitest'
import type { PenpotFileData, PenpotPage, PenpotShape } from '../src/backend.js'
import {
  auditPage,
  collectUsedTokens,
  extractText,
  readTokenLibrary,
  renderAudit,
  renderFind,
  renderOutline,
  renderPages,
  renderTokensCss,
  shapeText,
  textRuns,
} from '../src/design.js'

const shape = (id: string, name: string, type: string, x: number, y: number, width: number, height: number, extra: Record<string, unknown> = {}): PenpotShape => ({
  id,
  name,
  type,
  x,
  y,
  width,
  height,
  ...extra,
})

const content = (text: string, fontSize: string, fontWeight: string, color: string): Record<string, unknown> => ({
  type: 'root',
  children: [{
    type: 'paragraph-set',
    children: [{
      type: 'paragraph',
      fontSize,
      fontWeight,
      fontFamily: 'Inter',
      fills: [{ fillColor: color, fillOpacity: 1 }],
      children: [{ type: 'span', text, fontSize, fontWeight, fontFamily: 'Inter', fills: [{ fillColor: color, fillOpacity: 1 }] }],
    }],
  }],
})

const text = (id: string, name: string, x: number, y: number, width: number, height: number, value: string, options: { size?: number; weight?: number; color?: string; lineWidth?: number } = {}): PenpotShape => {
  const size = options.size ?? 14
  const color = options.color ?? '#111827'
  return shape(id, name, 'text', x, y, width, height, {
    parentId: 'screen',
    frameId: 'screen',
    content: content(value, String(size), String(options.weight ?? 400), color),
    positionData: [{
      x,
      y: y + 2,
      width: options.lineWidth ?? Math.min(width, 120),
      height: size * 1.4,
      x1: 0,
      y1: 0,
      x2: options.lineWidth ?? Math.min(width, 120),
      y2: size * 1.4,
      fontFamily: 'Inter',
      fontSize: `${String(size)}px`,
      fontWeight: String(options.weight ?? 400),
      fills: [{ fillColor: color, fillOpacity: 1 }],
      text: value,
    }],
  })
}

const page = (): PenpotPage => {
  const screen = shape('screen', 'Login screen', 'frame', 100, 50, 390, 844, {
    parentId: '00000000-0000-0000-0000-000000000000',
    frameId: '00000000-0000-0000-0000-000000000000',
    fills: [{ fillColor: '#FFFFFF', fillOpacity: 1 }],
    shapes: ['card', 'body', 'footer', 'wide', 'card-2', 'empty'],
  })
  const empty = shape('empty', 'Empty', 'frame', 700, 50, 100, 100, {
    parentId: 'screen',
    frameId: 'screen',
    fills: [{ fillColor: '#FFFFFF', fillOpacity: 1 }],
    shapes: [],
  })
  const card = shape('card', 'card', 'rect', 124, 100, 342, 132, { parentId: 'screen', frameId: 'screen', fills: [{ fillColor: '#F3F4F6', fillOpacity: 1 }], r1: 12, r2: 12, r3: 12, r4: 12 })
  const card2 = shape('card-2', 'card', 'rect', 124, 400, 342, 132, { parentId: 'screen', frameId: 'screen', fills: [{ fillColor: '#E5E7EB', fillOpacity: 1 }] })
  return {
    id: 'page-1',
    name: 'Page 1',
    objects: {
      '00000000-0000-0000-0000-000000000000': shape('00000000-0000-0000-0000-000000000000', 'Root Frame', 'frame', 0, 0, 0.01, 0.01, { parentId: '00000000-0000-0000-0000-000000000000', frameId: '00000000-0000-0000-0000-000000000000', shapes: ['screen'] }),
      screen,
      empty,
      card,
      'card-2': card2,
      body: text('body', 'body', 148, 150, 270, 60, 'Body copy', { size: 13, color: '#6B7280', lineWidth: 260 }),
      footer: text('footer', 'footer', 124, 800, 342, 20, 'Footer', { size: 11, color: '#9CA3AF', lineWidth: 100 }),
      wide: text('wide', 'wide', 124, 700, 100, 20, 'This line is wider than its box', { lineWidth: 200 }),
    },
  }
}

const file = (tokensLib?: Record<string, unknown>): PenpotFileData => ({
  id: 'file-1',
  name: 'Test file',
  revn: 7,
  vern: 0,
  data: {
    pages: ['page-1'],
    pagesIndex: { 'page-1': page() },
    ...(tokensLib === undefined ? {} : { tokensLib }),
  },
})

describe('text extraction', () => {
  it('walks paragraphs and spans', () => {
    const value = content('Hello', '14', '400', '#000000')
    expect(extractText(value)).toBe('Hello')
    const layered = {
      type: 'root',
      children: [
        { type: 'paragraph', children: [{ type: 'span', text: 'One' }] },
        { type: 'paragraph', children: [{ type: 'span', text: 'Two' }] },
      ],
    }
    expect(extractText(layered)).toBe('One\nTwo')
    expect(shapeText(text('t', 't', 0, 0, 100, 20, 'Visible'))).toBe('Visible')
  })

  it('inherits typography and exposes runs', () => {
    const runs = textRuns(text('t', 't', 0, 0, 100, 20, 'Visible', { size: 18, weight: 600, color: '#123456' }))
    expect(runs[0]).toMatchObject({ text: 'Visible', fontSize: 18, fontWeight: 600, fillColor: '#123456' })
  })
})

describe('outline and pages', () => {
  it('renders pages, frames and counts', () => {
    const report = renderPages(file(), 10)
    expect(report).toContain('Test file')
    expect(report).toContain('Login screen (screen)')
    expect(report).toContain('1 frame')
  })

  it('renders a bounded layer tree with text and styles', () => {
    const report = renderOutline(page(), { rootId: 'screen', depth: 1, maxShapes: 4 })
    expect(report).toContain('Login screen')
    expect(report).toContain('"Body copy"')
    expect(report).toContain('Inter 13')
    expect(report).toContain('radius 12')
    expect(report).toContain('stopped after 4 shapes')
  })

  it('finds shapes by name and text', () => {
    const report = renderFind(page(), 'body', 'text', 10)
    expect(report).toContain('#body')
    expect(report).toContain('Body copy')
  })
})

describe('tokens', () => {
  it('collects used colors, typography and radii', () => {
    const used = collectUsedTokens(page())
    expect(used.colors.find((color) => color.value === '#6B7280')?.count).toBe(1)
    expect(used.typography.find((entry) => entry.fontSize === 13)?.fontFamily).toBe('Inter')
    expect(used.radii[0]).toMatchObject({ value: 12, count: 1 })
  })

  it('reads the active library, resolves aliases and evaluates math for CSS', () => {
    const library = readTokenLibrary({
      Base: {
        color: { brand: { $value: '#2563EB', $type: 'color' } },
        size: { base: { $value: '8', $type: 'sizing' }, double: { $value: '{size.base} * 2', $type: 'sizing' } },
      },
      '$themes': [{ name: 'Light', group: 'Mode' }],
      '$metadata': { activeSets: ['Base'], activeThemes: ['Mode/Light'] },
    })
    expect(library?.tokens.find((token) => token.path === 'color.brand')?.resolved).toBe('#2563EB')
    expect(library?.tokens.find((token) => token.path === 'size.double')?.resolved).toBe('8 * 2')
    const css = renderTokensCss(library, collectUsedTokens(page()))
    expect(css).toContain('--color-brand: #2563EB;')
    expect(css).toContain('--size-double: 16px;')
    expect(css).toContain('--penpot-color-1:')
  })
})

describe('audit', () => {
  it('finds contrast, small text, overflow, empty frames and duplicate names', () => {
    const issues = auditPage(page())
    expect(issues.some((issue) => issue.rule === 'low-contrast' && issue.shapeId === 'footer')).toBe(true)
    expect(issues.some((issue) => issue.rule === 'small-text')).toBe(true)
    expect(issues.some((issue) => issue.rule === 'text-overflow' && issue.shapeId === 'wide')).toBe(true)
    expect(issues.some((issue) => issue.rule === 'empty-frame' && issue.shapeId === 'empty')).toBe(true)
    expect(issues.some((issue) => issue.rule === 'duplicate-name' && issue.message.includes('card'))).toBe(true)
    expect(renderAudit(page(), issues)).toContain('HIGH')
  })
})
