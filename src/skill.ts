/**
 * The Penpot skill that ships with the plugin.
 *
 * The skill lives at `skills/penpot/` in the npm package and is registered on
 * `ctx.skills` when the Host mounts the plugin, so installing the plugin makes
 * the model-facing skill available without a second profile entry.
 *
 * @module dsh-penpot-plugin/skill
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'

const PROVIDER_NAME = 'dsh-penpot'
const SKILL_NAME = 'penpot'
const SKILL_DIR = fileURLToPath(new URL('../skills/penpot/', import.meta.url))
const SKILL_PATH = join(SKILL_DIR, 'SKILL.md')
const FALLBACK_DESCRIPTION = 'Work with Penpot design files over the DSH Penpot plugin: inspect pages and layers, extract design tokens, audit accessibility, read comments, manage versions and export or import files.'

interface SkillCandidate {
  name: string
  description: string
  invocation: { modelInvocable: boolean; userInvocable: boolean }
  provider: string
  source: string
  resourceBase: { kind: 'directory'; path: string }
  rank: number
  locator: string | undefined
}

interface SkillDefinition extends Omit<SkillCandidate, 'rank' | 'locator'> {
  content: string
}

interface SkillProvider {
  name: string
  list: (options: { signal?: AbortSignal }) => Promise<readonly SkillCandidate[]>
  get: (candidate: SkillCandidate, options: { signal?: AbortSignal }) => Promise<SkillDefinition | undefined>
}

interface SkillRegistry {
  registerProvider: (create: (control: { signal: AbortSignal; invalidate: () => void }) => SkillProvider) => () => void
}

/** Parse the small frontmatter subset used by the shipped skill. */
function parseSkill(raw: string): { description: string; content: string } {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw)
  if (frontmatter?.[1] === undefined) return { description: FALLBACK_DESCRIPTION, content: raw.trim() }
  const description = /^description:\s*(.+)$/mu.exec(frontmatter[1])?.[1]?.trim()
  return {
    description: description === undefined || description.length === 0 ? FALLBACK_DESCRIPTION : description,
    content: raw.slice(frontmatter[0].length).trim(),
  }
}

async function readSkill(signal?: AbortSignal): Promise<{ description: string; content: string }> {
  return parseSkill(await readFile(SKILL_PATH, { encoding: 'utf8', ...(signal === undefined ? {} : { signal }) }))
}

function candidate(description: string): SkillCandidate {
  return {
    name: SKILL_NAME,
    description,
    invocation: { modelInvocable: true, userInvocable: true },
    provider: PROVIDER_NAME,
    source: 'bundled',
    resourceBase: { kind: 'directory', path: SKILL_DIR },
    rank: 600,
    locator: SKILL_PATH,
  }
}

/**
 * Register the bundled skill provider.
 *
 * `skills` is part of the standard DSH base composition; the optional lookup
 * keeps the plugin usable in a deliberately minimal test harness.
 */
export function registerPenpotSkill(ctx: Context): void {
  const registry = (ctx as Context & { skills?: SkillRegistry }).skills
  if (registry === undefined) return
  registry.registerProvider(() => {
    const provider: SkillProvider = {
      name: PROVIDER_NAME,
      async list(options) {
        try {
          const parsed = await readSkill(options.signal)
          return [candidate(parsed.description)]
        } catch {
          return []
        }
      },
      async get(_candidate, options) {
        const parsed = await readSkill(options.signal)
        const { rank: _rank, locator: _locator, ...summary } = candidate(parsed.description)
        return { ...summary, content: parsed.content }
      },
    }
    return provider
  })
}
