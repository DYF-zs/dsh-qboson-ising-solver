import test from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { SkillRegistry } from '@deepseek-ai/dsh-skill'
import { parse } from 'yaml'
import * as skills from '../src/skills.js'

test('DSH discovers, loads and unloads both Kaiwu and KPP Skills', async (t) => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  new SkillRegistry(ctx)
  const fiber = ctx.plugin(skills)
  await fiber.inertia
  assert.equal(fiber.state, 2)
  const catalog = await ctx.skills.list()
  assert.deepEqual(catalog.map((entry) => entry.name).sort(), ['kaiwu-coding-skill', 'kpp-coding-skill'])
  for (const summary of catalog) {
    const skill = await ctx.skills.get(summary.name)
    const raw = await readFile(skill.path, 'utf8')
    const metadata = parse(raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1])
    assert.equal(skill.name, metadata.name)
    assert.equal(summary.description, metadata.description)
    assert.equal(summary.source, 'bundled')
    assert.ok(skill.content.length > 0)
    assert.ok(!skill.content.startsWith('---'))
    assert.equal(skill.resourceBase.kind, 'directory')
    const references = skill.name === 'kpp-coding-skill'
      ? ['examples.md', 'kaiwu_pytorch_plugin.md']
      : ['problem-catalog.md', 'examples.md', 'hardware-workflow.md']
    const entries = [skill.path, ...references.map((file) => resolve(skill.resourceBase.path, 'references', file))]
    for (const entry of entries) {
      const body = await readFile(entry, 'utf8')
      for (const [, target] of body.matchAll(/\]\(([^)]+)\)/g)) {
        if (/^[a-z]+:/i.test(target) || target.startsWith('#')) continue
        await access(resolve(dirname(entry), target.split('#')[0]))
      }
    }
  }
  await fiber.dispose()
  assert.deepEqual(await ctx.skills.list(), [])
})
