import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { evaluatePluginCompatibility, getDshRuntimeVersion } from '@deepseek-ai/dsh-app-boot'

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

test('plugin passes the target DSH runtime compatibility gate without exemptions', () => {
  assert.equal(manifest.engines.dsh, '>=0.2.0-rc.2 <0.3.0-0')
  for (const [name, range] of Object.entries(manifest.peerDependencies)) {
    if (name.startsWith('@deepseek-ai/dsh-')) assert.equal(range, manifest.engines.dsh)
  }
  assert.equal(getDshRuntimeVersion(), manifest.devDependencies['@deepseek-ai/dsh-app-boot'])
  assert.equal(evaluatePluginCompatibility(manifest), undefined)
  for (const version of ['0.2.0-rc.2', '0.2.0', '0.2.1-rc.5', '0.2.2-rc.2', '0.2.2-rc.3']) {
    assert.equal(evaluatePluginCompatibility(manifest, {}, version), undefined)
  }
})

test('compatibility gate checks DSH peers when engines.dsh is absent', () => {
  const peerManifest = {
    ...manifest,
    engines: { node: manifest.engines.node },
    peerDependencies: { ...manifest.peerDependencies, '@deepseek-ai/dsh-tools': '^0.1.0-0' },
  }
  const issue = evaluatePluginCompatibility(peerManifest)
  assert.equal(issue.exempted, false)
  assert.equal(issue.requirements['@deepseek-ai/dsh-tools'], '^0.1.0-0')
})

test('plugin excludes DSH versions outside the declared range', () => {
  for (const version of ['0.1.5-rc.1', '0.2.0-rc.1', '0.3.0-0', '0.3.0-alpha.1', '0.3.0-rc.1', '0.3.0']) {
    assert.ok(evaluatePluginCompatibility(manifest, {}, version))
  }
})
