import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { routeLocalReply } from '@shared/personality/fallbacks'
import { detectTraps, isClean } from '@shared/personality/traps'

interface GoldenRow {
  id: string
  user: string
  must?: string[]
  forbid_traps?: boolean
}

interface ForbiddenRow {
  id: string
  user: string
  must_not?: string[]
}

function loadJsonl<T>(name: string): T[] {
  const raw = readFileSync(join(process.cwd(), 'personality/eval', name), 'utf8')
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T)
}

describe('golden eval (local precepts)', () => {
  const rows = loadJsonl<GoldenRow>('golden.jsonl')
  it.each(rows)('$id', (row) => {
    const reply = routeLocalReply(row.user, () => 0)
    for (const needle of row.must ?? []) {
      expect(reply).toContain(needle)
    }
    if (row.forbid_traps) {
      expect(isClean(reply)).toBe(true)
    }
  })
})

describe('forbidden eval (local precepts)', () => {
  const rows = loadJsonl<ForbiddenRow>('forbidden.jsonl')
  it.each(rows)('$id', (row) => {
    const reply = routeLocalReply(row.user, () => 0)
    expect(isClean(reply)).toBe(true)
    for (const needle of row.must_not ?? []) {
      expect(reply.toLowerCase()).not.toContain(needle.toLowerCase())
    }
    expect(detectTraps(reply)).toEqual([])
  })
})
