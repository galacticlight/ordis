import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

describe('mac launch helpers', () => {
  it('exposes spike, dev:mercury, and the named double-click launchers', () => {
    const pkg = readFileSync(join(root, 'package.json'), 'utf8')
    expect(pkg).toContain('"dev:mercury"')
    expect(pkg).toContain('ORDIS_MERCURY=raymarch')
    expect(pkg).toContain('"spike"')
    expect(pkg).toContain('spike/vite.config.ts')
    expect(existsSync(join(root, 'Launch Mercury Preview.command'))).toBe(true)
    expect(existsSync(join(root, 'Launch Ordis App.command'))).toBe(true)
    expect(existsSync(join(root, 'Launch Ordis Mercury.command'))).toBe(true)
    const helper = readFileSync(join(root, 'scripts/macos-launch.sh'), 'utf8')
    expect(helper).toContain('npm run spike')
    expect(helper).toContain('npm run dev:mercury')
    expect(helper).toContain('--mercury=raymarch')
    expect(helper).toContain('release/mac-arm64/Ordis.app')
    expect(helper).toContain('npm run package:darwin-arm64')
    expect(helper).toContain('app_supports_mercury')
    expect(helper).toContain('resolveMercuryFlag')
    expect(helper).toContain('does not understand --mercury=raymarch')
    expect(helper).toContain('echo "Building Ordis.app (darwin-arm64). This can take a few minutes the first time..." >&2')
    expect(helper).toContain('npm run package:darwin-arm64 >&2')
    expect(helper).toContain('npm install >&2')
  })

  it('does not loosen sandbox, contextIsolation, or safeStorage', () => {
    const main = readFileSync(join(root, 'src/main/index.ts'), 'utf8')
    expect(main.match(/contextIsolation:\s*true/g)?.length).toBeGreaterThanOrEqual(2)
    expect(main.match(/sandbox:\s*true/g)?.length).toBeGreaterThanOrEqual(2)
    expect(main.match(/nodeIntegration:\s*false/g)?.length).toBeGreaterThanOrEqual(2)
    expect(main).not.toMatch(/sandbox:\s*false/)
    expect(main).not.toMatch(/contextIsolation:\s*false/)
    expect(main).not.toMatch(/nodeIntegration:\s*true/)
    const store = readFileSync(join(root, 'src/main/store.ts'), 'utf8')
    expect(store).toContain('safeStorage')
    const helper = readFileSync(join(root, 'scripts/macos-launch.sh'), 'utf8')
    expect(helper).not.toContain('sandbox')
    expect(helper).not.toContain('contextIsolation')
    expect(helper).not.toContain('safeStorage')
  })
})
