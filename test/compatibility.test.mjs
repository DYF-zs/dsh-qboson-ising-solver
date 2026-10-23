import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { evaluatePluginCompatibility, getDshRuntimeVersion } from '@deepseek-ai/dsh-app-boot'

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

test('plugin passes the target DSH runtime compatibility gate without exemptions', () => {
  assert.equal(getDshRuntimeVersion(), '0.2.1-rc.2')
  assert.equal(evaluatePluginCompatibility(manifest), undefined)
})

test('compatibility gate reproduces the old desktop rejection', () => {
  const previous = {
    ...manifest,
    peerDependencies: { ...manifest.peerDependencies, '@deepseek-ai/dsh-tools': '^0.1.0-0' },
  }
  const issue = evaluatePluginCompatibility(previous)
  assert.equal(issue.exempted, false)
  assert.equal(issue.requirements['@deepseek-ai/dsh-tools'], '^0.1.0-0')
})

test('plugin does not claim compatibility with older or untested minor runtimes', () => {
  assert.ok(evaluatePluginCompatibility(manifest, {}, '0.1.5-rc.1'))
  assert.ok(evaluatePluginCompatibility(manifest, {}, '0.3.0'))
})
