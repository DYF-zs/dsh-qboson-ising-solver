import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parse } from 'yaml'
import { Context } from '@deepseek-ai/cordis'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { SkillRegistry } from '@deepseek-ai/dsh-skill'
import { LocalFileSystem } from '@deepseek-ai/dsh-fs-local'

test('installation bundle mounts three plugins with independent Skill registration', async (t) => {
  const patch = parse(await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8'))
  const entries = patch.flatMap((operation) => operation.insert ?? [])
  assert.equal(entries.length, 3)
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  ctx.provide('systemPrompt', { tools() {} })
  new ToolRuntime(ctx)
  new SkillRegistry(ctx)
  await ctx.plugin(LocalFileSystem, { cwd: process.cwd() }).inertia
  ctx.provide('subprocess', {})
  ctx.provide('credentials', { resolve() { throw new Error('Plugin loading must not read credentials') } })
  const fibers = []
  for (const entry of entries) {
    const module = await import(entry.name)
    const fiber = ctx.plugin(module.default ?? module)
    await fiber.inertia
    assert.equal(fiber.state, 2, entry.name)
    fibers.push(fiber)
  }
  await new Promise(setImmediate)
  for (const name of ['solve_ising', 'solve_ising_file', 'prepare_kaiwu_runtime']) {
    assert.ok(ctx.tools.get(name))
  }
  assert.ok((await ctx.skills.get('kaiwu-optimization')).content)
  await fibers[0].dispose()
  await new Promise(setImmediate)
  for (const name of ['solve_ising', 'solve_ising_file', 'prepare_kaiwu_runtime']) {
    assert.equal(ctx.tools.get(name), undefined)
  }
  assert.ok((await ctx.skills.get('kaiwu-optimization')).content)
  await fibers[2].dispose()
  assert.deepEqual(await ctx.skills.list(), [])
})
