/**
 * dsh-disk-space — DeepSeek Harness host plugin.
 *
 * Wraps the read-only storage analyzer as three model-callable tools.
 * Scanning never deletes, moves or modifies user files. Cleanup commands are
 * only ever rendered into the HTML report for the human to review and run.
 */
import { spawn } from 'node:child_process'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'dsh-disk-space'
export const inject = ['tools']

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCAN_SCRIPT = path.join(ROOT, 'scripts', 'scan.py')
const REPORT_SCRIPT = path.join(ROOT, 'scripts', 'build_report.py')
const WORK_DIR = path.join(tmpdir(), 'dsh-disk-space')

// dsh-tools requires object nodes to state additionalProperties explicitly.
const OBJECT = { type: 'object', additionalProperties: true }
const renderObject = (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }]

function pythonBin() {
  return process.env.DSH_DISK_SPACE_PYTHON || (process.platform === 'win32' ? 'python' : 'python3')
}

/** Run a bundled Python script, honouring the tool's abort signal. */
function runPython(script, args, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin(), [script, ...args], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    const onAbort = () => child.kill()
    if (signal) {
      if (signal.aborted) { child.kill(); return }
      signal.addEventListener('abort', onAbort, { once: true })
    }
    child.on('error', (err) => {
      signal?.removeEventListener('abort', onAbort)
      reject(new Error(`Cannot start ${pythonBin()}: ${err.message}. Install Python 3 or set DSH_DISK_SPACE_PYTHON.`))
    })
    child.on('close', (code) => {
      signal?.removeEventListener('abort', onAbort)
      if (code !== 0) reject(new Error(`Python exited with code ${code}: ${stderr.trim() || '(no stderr)'}`))
      else resolve(stdout)
    })
  })
}

async function ensureWorkDir() {
  await mkdir(WORK_DIR, { recursive: true })
  return WORK_DIR
}

function stamp() {
  return new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
}

/** Bounded summary of a full scan result, safe to hand back to a model. */
function summarize(data, scanPath, bytes) {
  const groups = data.groups && typeof data.groups === 'object' ? data.groups : {}
  const groupTotals = {}
  const all = []
  for (const [group, rows] of Object.entries(groups)) {
    if (!Array.isArray(rows)) continue
    let total = 0
    for (const row of rows) {
      const kb = Number(row.size_kb) || 0
      total += kb
      all.push({ group, name: row.name, path: row.path, size_kb: kb, size_h: row.size_h })
    }
    groupTotals[group] = total
  }
  all.sort((a, b) => b.size_kb - a.size_kb)
  return {
    scanPath,
    bytes,
    generatedAt: data.generated_at ?? null,
    scanSeconds: data.scan_seconds ?? null,
    os: data.system?.os ?? null,
    disks: data.system?.disks ?? [],
    groupTotalsKb: groupTotals,
    top: all.slice(0, 20),
    note: 'Read-only scan. Nothing was deleted, moved or modified. Full data is at scanPath.',
  }
}

export function apply(ctx) {
  const scanTool = defineTool({
    name: 'diskspace_scan',
    description: 'Read-only scan of local disk usage on Windows or macOS. Returns disk capacity, per-group totals and the 20 largest space hogs. Writes the full scan JSON to a temp file and returns its path. Never deletes or modifies any file.',
    parameters: {},
    output: { schema: OBJECT, render: renderObject },
    async execute(_args, exec) {
      const dir = await ensureWorkDir()
      const raw = await runPython(SCAN_SCRIPT, [], exec.signal)
      let data
      try { data = JSON.parse(raw) } catch {
        throw new Error(`scan.py returned non-JSON output: ${raw.slice(0, 300)}`)
      }
      if (data.error) throw new Error(`${data.error}: ${data.message ?? ''}`)
      const scanPath = path.join(dir, `scan-${stamp()}.json`)
      await writeFile(scanPath, raw, 'utf8')
      return summarize(data, scanPath, Buffer.byteLength(raw, 'utf8'))
    },
  })

  const inspectTool = defineTool({
    name: 'diskspace_inspect',
    description: 'Read a previously saved scan JSON and return one category (group) of space hogs, or list all category names. Does not rescan the disk and does not modify anything.',
    parameters: {
      scanPath: { type: 'string', required: true, description: 'Absolute path returned by diskspace_scan' },
      group: { type: 'string', description: 'Category name; omit to list all categories with their totals' },
      limit: { type: 'number', description: 'Max rows to return (default 30, max 200)' },
    },
    output: { schema: OBJECT, render: renderObject },
    async execute(args) {
      const raw = await readFile(args.scanPath, 'utf8')
      const data = JSON.parse(raw)
      const groups = data.groups ?? {}
      const limit = Math.min(Math.max(Number(args.limit) || 30, 1), 200)
      if (!args.group) {
        const categories = Object.entries(groups).map(([name, rows]) => ({
          name,
          rows: Array.isArray(rows) ? rows.length : 0,
          total_kb: Array.isArray(rows) ? rows.reduce((s, r) => s + (Number(r.size_kb) || 0), 0) : 0,
        }))
        return { groups: categories, note: 'Pass a group name to see its rows.' }
      }
      const rows = groups[args.group]
      if (!Array.isArray(rows)) {
        return { error: 'unknown_group', available: Object.keys(groups) }
      }
      return { group: args.group, total: rows.length, rows: rows.slice(0, limit) }
    },
  })

  const reportTool = defineTool({
    name: 'diskspace_report',
    description: 'Generate a self-contained interactive HTML storage report from a saved scan JSON. The report contains the three-tier cleanup advice and copyable commands, but never executes them. Returns the report path.',
    parameters: {
      scanPath: { type: 'string', required: true, description: 'Absolute path returned by diskspace_scan' },
      outputPath: { type: 'string', description: 'Where to write the HTML. Defaults to the OS temp directory.' },
    },
    output: { schema: OBJECT, render: renderObject },
    async execute(args, exec) {
      const dir = await ensureWorkDir()
      const out = args.outputPath || path.join(dir, `storage-report-${stamp()}.html`)
      await runPython(REPORT_SCRIPT, [args.scanPath, out], exec.signal)
      const info = await stat(out)
      return {
        reportPath: out,
        bytes: info.size,
        note: 'Cleanup commands in this report are text only. Nothing has been deleted. Review every command before running it yourself.',
      }
    },
  })

  for (const tool of [scanTool, inspectTool, reportTool]) ctx.tools.register(tool)
}
