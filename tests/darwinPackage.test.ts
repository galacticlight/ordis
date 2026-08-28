import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()

describe("darwin-arm64 package job", () => {
  it("runs electron-builder on macos-14 for arm64 and uploads Ordis.app", () => {
    const ci = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8")
    const builder = readFileSync(join(root, "electron-builder.yml"), "utf8")
    const pkg = readFileSync(join(root, "package.json"), "utf8")
    expect(ci).toMatch(/runs-on:\s*macos-14/)
    expect(ci).toContain("npx electron-builder --mac dir --arm64")
    expect(ci).toContain("CSC_IDENTITY_AUTO_DISCOVERY")
    expect(ci).toContain("ordis-darwin-arm64")
    expect(ci).toContain("if-no-files-found: error")
    expect(builder).toMatch(/arch:/)
    expect(builder).toContain("arm64")
    expect(builder).toMatch(/identity:\s*null/)
    expect(pkg).toContain("package:darwin-arm64")
  })

  it("ships a 512px-or-larger icon.png for electron-builder mac", () => {
    const png = readFileSync(join(root, "resources/icon.png"))
    expect(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true)
    const width = png.readUInt32BE(16)
    const height = png.readUInt32BE(20)
    expect(width).toBeGreaterThanOrEqual(512)
    expect(height).toBeGreaterThanOrEqual(512)
  })
})
