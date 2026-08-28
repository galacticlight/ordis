import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

describe('overlay chrome on wake', () => {
  it('shows chrome and chat via CSS, not the HTML hidden attribute', () => {
    const overlay = readFileSync(join(root, 'src/renderer/src/overlay.ts'), 'utf8')
    const css = readFileSync(join(root, 'src/renderer/src/overlay.css'), 'utf8')
    const html = readFileSync(join(root, 'src/renderer/index.html'), 'utf8')
    expect(overlay).not.toMatch(/form\.hidden\s*=/)
    expect(overlay).not.toMatch(/chrome\.hidden\s*=/)
    expect(css).toMatch(/body\.interactive \.chrome[\s\S]*display:\s*flex\s*!important/)
    expect(css).toMatch(/body\.interactive \.chat[\s\S]*display:\s*flex\s*!important/)
    expect(html).not.toMatch(/id="chrome"[^>]*hidden/)
    expect(html).not.toMatch(/id="chat"[^>]*hidden/)
  })
})

describe('settings checkboxes', () => {
  it('resets checkbox appearance so the checked state can paint', () => {
    const css = readFileSync(join(root, 'src/renderer/src/settings.css'), 'utf8')
    expect(css).toMatch(/input:not\(\[type="checkbox"\]\)/)
    expect(css).toMatch(/-webkit-appearance:\s*checkbox/)
  })
})
