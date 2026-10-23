import test from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { SkillRegistry } from '@deepseek-ai/dsh-skill'
import { parse } from 'yaml'
import * as skills from '../src/skills.js'

test('DSH discovers, loads and unloads the bundled Kaiwu workflow', async (t) => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  new SkillRegistry(ctx)
  const fiber = ctx.plugin(skills)
  await fiber.inertia
  assert.equal(fiber.state, 2)
  const catalog = await ctx.skills.list()
  assert.equal(catalog.length, 1)
  assert.equal(catalog[0].name, 'kaiwu-optimization')
  const skill = await ctx.skills.get('kaiwu-optimization')
  const raw = await readFile(skill.path, 'utf8')
  const metadata = parse(raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1])
  assert.equal(catalog[0].description, metadata.description)
  assert.equal(catalog[0].source, 'bundled')
  assert.ok(skill.content.length > 0)
  assert.ok(!skill.content.startsWith('---'))
  assert.equal(skill.resourceBase.kind, 'directory')
  // Validate local links from the skill and its modeling references.
  const entries = [skill.path, ...['problem-catalog.md', 'examples.md', 'hardware-workflow.md'].map(
    (file) => resolve(skill.resourceBase.path, 'references', file),
  )]
  for (const entry of entries) {
    const body = await readFile(entry, 'utf8')
    for (const [, target] of body.matchAll(/\]\(([^)]+)\)/g)) {
      if (/^[a-z]+:/i.test(target) || target.startsWith('#')) continue
      await access(resolve(dirname(entry), target.split('#')[0]))
    }
  }
  await fiber.dispose()
  assert.deepEqual(await ctx.skills.list(), [])
})
