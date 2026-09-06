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

  it('does not hang on empty Transmit', () => {
    const overlay = readFileSync(join(root, 'src/renderer/src/overlay.ts'), 'utf8')
    const main = readFileSync(join(root, 'src/main/index.ts'), 'utf8')
    expect(overlay).toContain("Ordis is listening, Operator.")
    expect(overlay).toMatch(/if \(!text\)/)
    expect(main).toMatch(/if \(!trimmed\) \{/)
  })

  it('wakes from hit, tray Interact, and Ctrl+Shift+O without Settings unlocking TTS', () => {
    const overlay = readFileSync(join(root, 'src/renderer/src/overlay.ts'), 'utf8')
    const main = readFileSync(join(root, 'src/main/index.ts'), 'utf8')
    expect(overlay).toMatch(/hit\.addEventListener\('mouseenter'/) 
    expect(overlay).toMatch(/hit\.addEventListener\('click'/)
    expect(overlay).toContain('hoverArmed')
    expect(overlay).toContain("pointerleave")
    expect(main).toContain('overlay:hit-hover')
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
  it('paints a gold mark when checked, independent of native appearance', () => {
    const css = readFileSync(join(root, 'src/renderer/src/settings.css'), 'utf8')
    const html = readFileSync(join(root, 'src/renderer/settings.html'), 'utf8')
    expect(css).toMatch(/input:not\(\[type="checkbox"\]\)/)
    expect(css).toMatch(/-webkit-appearance:\s*none/)
    expect(css).toMatch(/input\[type="checkbox"\]:checked::after/)
    expect(html).toMatch(/id="alwaysOnTop"[^>]*checked/)
    expect(html).toMatch(/id="captionsEnabled"[^>]*checked/)
    expect(html).toMatch(/id="voiceOutEnabled"[^>]*checked/)
  })
})

describe('idle hit target', () => {
  it('does not paint a gold rect around the cube', () => {
    const css = readFileSync(join(root, 'src/renderer/src/overlay.css'), 'utf8')
    const hit = css.match(/\.hit \{[\s\S]*?\n\}/)?.[0]
    expect(hit).toBeTruthy()
    expect(hit).not.toMatch(/box-shadow/)
    expect(hit).not.toMatch(/--hairline/)
    expect(hit).toMatch(/background:\s*transparent/)
  })
})


describe('Harbor vs steward cue', () => {
  it('Settings and overlay cue copy follow PublicSettings.hasApiKey', () => {
    const cue = readFileSync(join(root, 'src/shared/harborCue.ts'), 'utf8')
    const settings = readFileSync(join(root, 'src/renderer/src/settings.ts'), 'utf8')
    const settingsHtml = readFileSync(join(root, 'src/renderer/settings.html'), 'utf8')
    const overlay = readFileSync(join(root, 'src/renderer/src/overlay.ts'), 'utf8')
    const overlayHtml = readFileSync(join(root, 'src/renderer/index.html'), 'utf8')
    const overlayCss = readFileSync(join(root, 'src/renderer/src/overlay.css'), 'utf8')
    const preload = readFileSync(join(root, 'src/preload/index.ts'), 'utf8')
    const main = readFileSync(join(root, 'src/main/index.ts'), 'utf8')
    const store = readFileSync(join(root, 'src/main/store.ts'), 'utf8')

    expect(cue).toContain('Harbor linked · Grok ready')
    expect(cue).toContain('Speaking from local precepts · Harbor optional')
    expect(cue).toContain('hasApiKey')
    expect(settings).toContain('harborLinkCue')
    expect(settings).toContain('settings.hasApiKey')
    expect(settings).toContain('describeKey')
    expect(settingsHtml).toContain('id="key-status"')
    expect(settingsHtml).toMatch(/local precepts/)
    expect(overlay).toContain('harborLinkCue')
    expect(overlay).toContain('applyHarborCue')
    expect(overlay).toContain('onSettings')
    expect(overlay).toContain('getSettings')
    expect(overlay).not.toMatch(/apiKey\s*[:=]/)
    expect(overlayHtml).toContain('id="harbor-cue"')
    expect(overlayCss).toContain('.harbor-cue')
    expect(preload).toContain("onSettings: (cb) => subscribe('ordis:settings', cb)")
    expect(main).toContain("sendOverlay('ordis:settings', toPublicSettings(settings))")
    expect(store).toContain('hasApiKey: settings.apiKey.trim().length > 0')
  })
})
