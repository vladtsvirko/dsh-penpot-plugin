import { describe, expect, it } from 'vitest'
import type { PenpotPage, PenpotShape } from '../src/backend.js'
import { renderFrameSvg } from '../src/render.js'

const shape = (id: string, name: string, type: string, x: number, y: number, width: number, height: number, extra: Record<string, unknown> = {}): PenpotShape => ({ id, name, type, x, y, width, height, ...extra })

describe('frame SVG renderer', () => {
  it('renders a frame, rect, circle and centered text', () => {
    const page: PenpotPage = {
      id: 'page-1',
      name: 'Page 1',
      objects: {
        '00000000-0000-0000-0000-000000000000': shape('00000000-0000-0000-0000-000000000000', 'Root Frame', 'frame', 0, 0, 0.01, 0.01, { parentId: '00000000-0000-0000-0000-000000000000', frameId: '00000000-0000-0000-0000-000000000000', shapes: ['frame-1'] }),
        'frame-1': shape('frame-1', 'Screen', 'frame', 100, 50, 390, 844, { parentId: '00000000-0000-0000-0000-000000000000', frameId: '00000000-0000-0000-0000-000000000000', fills: [{ fillColor: '#FFFFFF', fillOpacity: 1 }], shapes: ['rect-1', 'circle-1', 'text-1', 'image-1'] }),
        'rect-1': shape('rect-1', 'Card', 'rect', 124, 150, 342, 132, { parentId: 'frame-1', frameId: 'frame-1', fills: [{ fillColor: '#F3F4F6', fillOpacity: 1 }], r1: 12 }),
        'circle-1': shape('circle-1', 'Avatar', 'circle', 280, 452, 48, 48, { parentId: 'frame-1', frameId: 'frame-1', fills: [{ fillColor: '#E6E8EB', fillOpacity: 1 }] }),
        'text-1': shape('text-1', 'Label', 'text', 124, 375, 342, 20, {
          parentId: 'frame-1', frameId: 'frame-1',
          content: { type: 'root', children: [{ type: 'paragraph-set', children: [{ type: 'paragraph', children: [{ text: 'Continue', fontFamily: 'Inter', fontSize: '14', fontWeight: '600', fills: [{ fillColor: '#FFFFFF', fillOpacity: 1 }] }] }] }] },
          positionData: [{ x: 124, y: 377, width: 342, height: 20, textAlign: 'center', fontFamily: 'Inter', fontSize: '14px', fontWeight: '600', fills: [{ fillColor: '#FFFFFF', fillOpacity: 1 }], text: 'Continue' }],
        }),
        'image-1': shape('image-1', 'Image', 'image', 124, 500, 342, 200, { parentId: 'frame-1', frameId: 'frame-1', metadata: { id: 'media-1', width: 400, height: 300, mtype: 'image/png' } }),
      },
    }
    const render = renderFrameSvg(page, 'frame-1')
    expect(render.width).toBe(390)
    expect(render.height).toBe(844)
    expect(render.svg).toContain('<rect x="24" y="100" width="342" height="132"')
    expect(render.svg).toContain('<ellipse cx="204" cy="426"')
    expect(render.svg).toContain('text-anchor="middle"')
    expect(render.svg).toContain('>Continue</text>')
    expect(render.limitations.some((item) => item.includes('image'))).toBe(true)
  })
})
