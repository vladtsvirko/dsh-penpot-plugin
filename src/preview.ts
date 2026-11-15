/**
 * PNG preview through a user-provided headless browser.
 *
 * The browser renders the plugin's best-effort SVG, not Penpot's WASM canvas.
 * That keeps the plugin free of a bundled Chromium while still giving the user
 * a real PNG when they configure a Chrome/Chromium/Edge executable.
 *
 * @module dsh-penpot-plugin/preview
 */

import { execFile } from 'node:child_process'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export interface PngPreviewInput {
  svg: string
  width: number
  height: number
  path: string
  browserPath: string
}

/** Render an SVG document to a PNG file with the configured browser. */
export async function renderSvgToPng(input: PngPreviewInput): Promise<{ bytes: number }> {
  const directory = await mkdtemp(join(tmpdir(), 'penpot-frame-'))
  const svgPath = join(directory, 'frame.svg')
  try {
    await writeFile(svgPath, input.svg, 'utf8')
    const args = [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${join(directory, 'profile')}`,
      `--window-size=${String(input.width)},${String(input.height)}`,
      `--screenshot=${input.path}`,
      pathToFileURL(svgPath).toString(),
    ]
    await new Promise<void>((resolve, reject) => {
      execFile(input.browserPath, args, { timeout: 60_000 }, (error, _stdout, stderr) => {
        if (error !== null) {
          reject(new Error(`headless browser failed: ${stderr.trim() || error.message}`))
          return
        }
        resolve()
      })
    })
    const info = await stat(input.path)
    return { bytes: info.size }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
