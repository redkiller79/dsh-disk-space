import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'))

test('manifest: installable DSH bundle with no install-time scripts', async () => {
  assert.equal(pkg.name, 'dsh-disk-space')
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/)
  assert.equal(pkg.type, 'module')
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.deepEqual(pkg.dependencies, {})
  const lifecycle = ['preinstall', 'install', 'postinstall', 'prepare']
  for (const key of lifecycle) assert.equal(pkg.scripts?.[key], undefined, `no ${key} script`)
  assert.equal(pkg.publishConfig.access, 'public')
  assert.ok(pkg.peerDependencies['@deepseek-ai/dsh-tools'])
})

test('bundle patch: one unique host entry declaring tools injection', async () => {
  const yml = await readFile(path.join(ROOT, 'cordis.patch.yml'), 'utf8')
  assert.match(yml, /-\s+insert:/)
  assert.match(yml, /id:\s*dsh-disk-space/)
  assert.match(yml, /name:\s*'dsh-disk-space'/)
  assert.match(yml, /inject:\s*\[tools\]/)
  assert.equal((yml.match(/id:\s*dsh-disk-space/g) || []).length, 1)
})

test('bundled Python scripts and report template are present', async () => {
  for (const f of ['scripts/scan.py', 'scripts/build_report.py', 'assets/report_template.html', 'LICENSE', 'NOTICE.md', 'README.md']) {
    const buf = await readFile(path.join(ROOT, f))
    assert.ok(buf.length > 100, `${f} is not empty`)
  }
  const license = await readFile(path.join(ROOT, 'LICENSE'), 'utf8')
  assert.match(license, /MIT License/)
  assert.match(license, /Copyright \(c\) 2026 飞哥/)
})

test('apply() registers three model-callable tools', async () => {
  const { apply, name, inject } = await import('../lib/index.js')
  assert.equal(name, 'dsh-disk-space')
  assert.deepEqual(inject, ['tools'])
  const registered = []
  apply({ tools: { register: (t) => registered.push(t) } })
  assert.equal(registered.length, 3)
  const names = registered.map((t) => t.name).sort()
  assert.deepEqual(names, ['diskspace_inspect', 'diskspace_report', 'diskspace_scan'])
  for (const t of registered) {
    assert.equal(typeof t.execute, 'function', `${t.name} has execute`)
    assert.ok(t.description && t.description.length > 20, `${t.name} has a description`)
  }
})

test('diskspace_inspect reads a saved scan without rescanning', async () => {
  const { apply } = await import('../lib/index.js')
  const registered = []
  apply({ tools: { register: (t) => registered.push(t) } })
  const inspect = registered.find((t) => t.name === 'diskspace_inspect')
  const dir = await mkdtemp(path.join(tmpdir(), 'dsh-disk-space-test-'))
  const scanPath = path.join(dir, 'scan.json')
  await writeFile(scanPath, JSON.stringify({
    groups: {
      caches: [{ name: 'npm', path: '/tmp/npm', size_kb: 2048, size_h: '2.0 MB' }],
      downloads: [],
    },
  }), 'utf8')
  try {
    const all = await inspect.execute({ scanPath })
    assert.equal(all.groups.length, 2)
    assert.equal(all.groups[0].total_kb, 2048)
    const one = await inspect.execute({ scanPath, group: 'caches' })
    assert.equal(one.rows[0].name, 'npm')
    const missing = await inspect.execute({ scanPath, group: 'nope' })
    assert.equal(missing.error, 'unknown_group')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
