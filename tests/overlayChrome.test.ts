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
    expect(overlay).toContain("form.removeAttribute('hidden')")
    expect(overlay).toContain("chrome.removeAttribute('hidden')")
    expect(overlay).toContain('if (spoken) setCaption(spoken)')
    expect(css).toMatch(/body\.interactive \.chrome[\s\S]*display:\s*flex\s*!important/)
    expect(css).toMatch(/body\.interactive \.chat[\s\S]*display:\s*flex\s*!important/)
    expect(css).toMatch(/body\.interactive \.caption:not\(\[hidden\]\)/)
    expect(html).not.toMatch(/id="chrome"[^>]*hidden/)
    expect(html).not.toMatch(/id="chat"[^>]*hidden/)
  })

  it('wakes from hit, tray Interact, and Ctrl+Shift+O without Settings unlocking TTS', () => {
    const overlay = readFileSync(join(root, 'src/renderer/src/overlay.ts'), 'utf8')
    const main = readFileSync(join(root, 'src/main/index.ts'), 'utf8')
    expect(overlay).toMatch(/hit\.addEventListener\('mouseenter',\s*wake\)/)
    expect(overlay).toMatch(/hit\.addEventListener\('click',\s*wake\)/)
    expect(main).toMatch(/label: 'Interact',\s*click: \(\) => setInteractive\(true\)/)
    expect(main).toMatch(/CommandOrControl\+Shift\+O',\s*\(\) => setInteractive\(!interactive\)/)
    const open = main.match(/function openSettings\(\): void \{[\s\S]*?\n\}/)?.[0]
    expect(open).toBeTruthy()
    expect(open).not.toMatch(/\bunlock\b/)
    expect(open).not.toMatch(/setInteractive\(true\)/)
    expect(main).toMatch(/overlay:open-settings',\s*\(\) => openSettings\(\)/)
    expect(main).toMatch(/label: 'Settings…',\s*click: \(\) => openSettings\(\)/)
  })
})

describe('settings checkboxes', () => {
  it('resets checkbox appearance so the checked state can paint', () => {
    const css = readFileSync(join(root, 'src/renderer/src/settings.css'), 'utf8')
    expect(css).toMatch(/input:not\(\[type="checkbox"\]\)/)
    expect(css).not.toMatch(/^input,\s*select\s*\{/m)
    expect(css).toMatch(/-webkit-appearance:\s*checkbox/)
    expect(css).toMatch(/input\[type="checkbox"\][\s\S]*appearance:\s*auto/)
  })
})
