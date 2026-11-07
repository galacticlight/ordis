import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { overlayPageUrl } from '../src/main/overlayUrl'

describe('overlayPageUrl', () => {
  it('uses the vite origin for the overlay and settings in dev', () => {
    expect(overlayPageUrl('index', 'http://localhost:5173', 'file:///tmp/index.html')).toBe(
      'http://localhost:5173'
    )
    expect(overlayPageUrl('settings', 'http://localhost:5173/', 'file:///tmp/settings.html')).toBe(
      'http://localhost:5173/settings.html'
    )
  })

  it('appends mercury=raymarch only on the overlay when asked', () => {
    expect(
      overlayPageUrl('index', 'http://localhost:5173', 'file:///tmp/index.html', 'raymarch')
    ).toBe('http://localhost:5173/?mercury=raymarch')
    expect(
      overlayPageUrl('settings', 'http://localhost:5173', 'file:///tmp/settings.html', 'raymarch')
    ).toBe('http://localhost:5173/settings.html')
    expect(
      overlayPageUrl('index', null, 'file:///tmp/index.html', 'raymarch')
    ).toBe('file:///tmp/index.html?mercury=raymarch')
    expect(overlayPageUrl('index', 'http://localhost:5173', 'file:///tmp/index.html', 'mesh')).toBe(
      'http://localhost:5173'
    )
  })

  it('main loads pages through overlayPageUrl', () => {
    const main = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')
    expect(main).toContain('overlayPageUrl')
    expect(main).toContain('ORDIS_MERCURY')
  })
})
