/**
 * Exact frame PNG through Penpot's render page and a headless browser.
 *
 * Penpot's own exporter uses Playwright to load `/render.html` with an
 * authenticated session cookie and screenshot the `#screenshot-<id>` element.
 * This module does the same through the Chrome DevTools Protocol using the
 * browser the user configured for previews. It bypasses the exporter's
 * `/assets/by-id` upload/download path, so no asset proxy is needed for a
 * frame screenshot.
 *
 * @module dsh-penpot-plugin/browser-shot
 */

import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface NativeFrameInput {
  browserPath: string
  baseUrl: string
  cookieValue: string
  fileId: string
  pageId: string
  frameId: string
  scale: number
}

interface CdpMessage {
  id?: number
  method?: string
  result?: Record<string, unknown>
  error?: { message?: string }
}

interface CdpSocket {
  addEventListener: (name: string, listener: (event: { data?: unknown }) => void, options?: { once?: boolean }) => void
  send: (data: string) => void
  close: () => void
}

type CdpSocketConstructor = new (url: string) => CdpSocket

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const freePort = async (): Promise<number> => {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  await new Promise<void>((resolve) => server.close(() => resolve()))
  if (port === 0) throw new Error('could not allocate a Chrome debugging port')
  return port
}

const waitForDebugger = async (port: number): Promise<string> => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${String(port)}/json/list`)
      const targets = await response.json() as Array<Record<string, unknown>>
      const page = targets.find((target) => target['type'] === 'page')
      if (typeof page?.['webSocketDebuggerUrl'] === 'string') return page['webSocketDebuggerUrl']
    } catch {
      // Chrome is still starting.
    }
    await sleep(200)
  }
  throw new Error('Chrome did not expose a DevTools endpoint')
}

/**
 * Render one Penpot frame using the deployment's render page. Returns PNG bytes
 * at `scale` device pixels per design pixel.
 */
export async function renderNativeFramePng(input: NativeFrameInput): Promise<Uint8Array> {
  const WebSocketImpl = (globalThis as { WebSocket?: CdpSocketConstructor }).WebSocket
  if (WebSocketImpl === undefined) {
    throw new Error('native PNG export needs a Node runtime with the WebSocket client (Node 22+)')
  }
  const port = await freePort()
  const directory = await mkdtemp(join(tmpdir(), 'penpot-native-'))
  const child = spawn(input.browserPath, [
    '--headless=new',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    '--ignore-certificate-errors',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${String(port)}`,
    `--user-data-dir=${join(directory, 'profile')}`,
    'about:blank',
  ], { stdio: 'ignore' })
  let socket: CdpSocket | undefined
  let nextId = 0
  const pending = new Map<number, { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void }>()
  try {
    const wsUrl = await waitForDebugger(port)
    socket = new WebSocketImpl(wsUrl)
    await new Promise<void>((resolve, reject) => {
      socket?.addEventListener('open', () => resolve(), { once: true })
      socket?.addEventListener('error', () => reject(new Error('could not connect to Chrome DevTools')), { once: true })
    })
    socket.addEventListener('message', (event) => {
      const raw = typeof event.data === 'string' ? event.data : undefined
      if (raw === undefined) return
      const message = JSON.parse(raw) as CdpMessage
      if (message.id === undefined) return
      const waiter = pending.get(message.id)
      if (waiter === undefined) return
      pending.delete(message.id)
      if (message.error !== undefined) waiter.reject(new Error(message.error.message ?? 'Chrome DevTools command failed'))
      else waiter.resolve(message.result ?? {})
    })
    const send = (method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> => new Promise((resolve, reject) => {
      if (socket === undefined) {
        reject(new Error('Chrome DevTools is not connected'))
        return
      }
      const id = ++nextId
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ id, method, params }))
    })

    await send('Network.enable')
    await send('Page.enable')
    await send('Runtime.enable')
    const origin = new URL(input.baseUrl)
    await send('Network.setCookie', {
      name: 'auth-token',
      value: input.cookieValue,
      url: `${origin.origin}/`,
      path: '/',
      httpOnly: true,
      secure: origin.protocol === 'https:',
    })
    const url = `${input.baseUrl.replace(/\/+$/u, '')}/render.html?file-id=${encodeURIComponent(input.fileId)}&page-id=${encodeURIComponent(input.pageId)}&object-id=${encodeURIComponent(input.frameId)}&route=objects`
    await send('Page.navigate', { url })

    const selector = `#screenshot-${input.frameId}`
    let rect: { x: number; y: number; width: number; height: number } | undefined
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await sleep(500)
      const evaluated = await send('Runtime.evaluate', {
        expression: `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`,
        returnByValue: true,
      })
      const value = (evaluated['result'] as Record<string, unknown> | undefined)?.['value'] as Record<string, unknown> | null | undefined
      if (value !== null && value !== undefined && Number(value['width']) > 0 && Number(value['height']) > 0) {
        rect = { x: Number(value['x']), y: Number(value['y']), width: Number(value['width']), height: Number(value['height']) }
        break
      }
    }
    if (rect === undefined) {
      const body = await send('Runtime.evaluate', { expression: 'document.body?.innerText?.slice(0, 500) ?? ""', returnByValue: true })
      throw new Error(`Penpot render page did not expose ${selector}: ${String((body['result'] as Record<string, unknown> | undefined)?.['value'] ?? '')}`)
    }
    await send('Runtime.evaluate', {
      expression: '(() => { if (document.fonts) { for (const face of document.fonts) face.load().catch(() => {}); return document.fonts.ready; } return true; })()',
      awaitPromise: true,
      returnByValue: true,
    })
    await sleep(300)
    const shot = await send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: true,
      clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: Math.max(1, Math.min(4, input.scale)) },
    })
    if (typeof shot['data'] !== 'string') throw new Error('Chrome returned no screenshot data')
    return new Uint8Array(Buffer.from(shot['data'], 'base64'))
  } finally {
    socket?.close()
    child.kill('SIGKILL')
    await rm(directory, { recursive: true, force: true })
  }
}
