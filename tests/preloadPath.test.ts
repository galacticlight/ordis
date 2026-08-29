import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { resolvePreload } from "../src/main/preloadPath"

describe("preload path", () => {
  it("prefers CJS index.js and falls back to index.mjs", () => {
    const files = new Set([join("/app/preload", "index.mjs")])
    expect(resolvePreload("/app/preload", (path) => files.has(path))).toBe(
      join("/app/preload", "index.mjs")
    )
    files.add(join("/app/preload", "index.js"))
    expect(resolvePreload("/app/preload", (path) => files.has(path))).toBe(
      join("/app/preload", "index.js")
    )
  })

  it("emits CJS preload index.js and main resolves the real file", () => {
    const vite = readFileSync(join(process.cwd(), "electron.vite.config.ts"), "utf8")
    const main = readFileSync(join(process.cwd(), "src/main/index.ts"), "utf8")
    expect(vite).toMatch(/format:\s*"cjs"|format:\s*'cjs'/)
    expect(vite).toContain("entryFileNames: '[name].js'")
    expect(main).toContain("resolvePreload")
    expect(main).toContain("../preload")
    expect(main).not.toContain("'../preload/index.js'")
  })
})
