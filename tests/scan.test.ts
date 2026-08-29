import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { INJECTION_MARKERS, shouldSkipScan } from '@shared/personality/traps'

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'out' || name === 'dist' || name === '.git' || name === 'vendor' || name === 'release') continue
      walk(full, acc)
    } else {
      acc.push(full)
    }
  }
  return acc
}

describe('source must not implement fault injection', () => {
  it('does not ship a dedicated injection module', () => {
    expect(existsSync(join(process.cwd(), 'src/shared/personality/glitch.ts'))).toBe(false)
  })

  it('does not contain injection markers outside detectors and tests', () => {
    const files = walk(process.cwd()).filter((f) => /\.(ts|tsx|js|yml|yaml|md|json)$/.test(f))
    const hits: string[] = []
    for (const file of files) {
      if (shouldSkipScan(file)) continue
      const text = readFileSync(file, 'utf8')
      for (const marker of INJECTION_MARKERS) {
        if (text.includes(marker)) hits.push(`${file}: ${marker}`)
      }
    }
    expect(hits).toEqual([])
  })

  it('does not use the banned adjective anywhere in product files', () => {
    const banned = `glitch${'y'}`
    const files = walk(process.cwd()).filter((f) => !f.includes('node_modules') && !f.includes('/.git/'))
    const hits: string[] = []
    for (const file of files) {
      if (shouldSkipScan(file)) continue
      if (/\.(png|jpg|jpeg|lock)$/.test(file)) continue
      try {
        const text = readFileSync(file, 'utf8')
        if (text.toLowerCase().includes(banned)) hits.push(file)
      } catch {
        // binary
      }
    }
    expect(hits).toEqual([])
  })
})

describe('eval jsonl', () => {
  it('golden and forbidden sets exist', () => {
    const golden = readFileSync(join(process.cwd(), 'personality/eval/golden.jsonl'), 'utf8')
      .trim()
      .split('\n')
    const forbidden = readFileSync(join(process.cwd(), 'personality/eval/forbidden.jsonl'), 'utf8')
      .trim()
      .split('\n')
    expect(golden.length).toBeGreaterThanOrEqual(8)
    expect(forbidden.length).toBeGreaterThanOrEqual(5)
  })
})
