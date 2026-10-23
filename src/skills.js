import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { BUNDLED_SKILL_RANK, isSkillName } from '@deepseek-ai/dsh-skill'

export const name = 'qboson-kaiwu-skill'
export const inject = ['skills']

const directory = fileURLToPath(new URL('../assets/kaiwu-optimization/', import.meta.url))
const path = fileURLToPath(new URL('../assets/kaiwu-optimization/SKILL.md', import.meta.url))

async function readSkill(signal) {
  const raw = await readFile(path, { encoding: 'utf8', signal })
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw)
  if (!frontmatter) throw new Error(`${name}: SKILL.md has no frontmatter`)
  const metadata = parse(frontmatter[1])
  if (typeof metadata?.name !== 'string' || !isSkillName(metadata.name) || typeof metadata.description !== 'string' || !metadata.description.trim()) {
    throw new Error(`${name}: SKILL.md must define a valid name and description`)
  }
  return { name: metadata.name, description: metadata.description, content: raw.slice(frontmatter[0].length).trim() }
}

export async function apply(ctx) {
  const entry = await readSkill()
  const candidate = {
    name: entry.name,
    description: entry.description,
    invocation: { modelInvocable: true, userInvocable: true },
    provider: name,
    source: 'bundled',
    rank: BUNDLED_SKILL_RANK,
    resourceBase: { kind: 'directory', path: directory },
    path,
    locator: path,
  }
  ctx.skills.registerProvider(() => ({
    name,
    async list() { return [candidate] },
    async get(_candidate, options) {
      const skill = await readSkill(options.signal)
      const { rank: _rank, locator: _locator, ...summary } = candidate
      return { ...summary, ...skill }
    },
  }))
}
