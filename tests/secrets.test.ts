import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  leftoverPlain,
  packSecret,
  PlaintextKeyRefused,
  scrubSecretDisk,
  unpackSecret,
  type SecretBox
} from "@shared/secrets"

function memoryBox(available: boolean): SecretBox {
  const store = new Map<string, string>()
  return {
    isAvailable: () => available,
    encrypt: (value: string) => {
      const token = `enc:${value}`
      store.set(token, value)
      return token
    },
    decrypt: (enc: string) => {
      const value = store.get(enc)
      if (value === undefined) throw new Error("missing")
      return value
    }
  }
}

describe("secret packing", () => {
  it("refuses to pack a key when OS encryption is unavailable", () => {
    expect(() => packSecret("sk-test", memoryBox(false))).toThrow(PlaintextKeyRefused)
  })

  it("scrubs leftover plain and never unpacks it", () => {
    const box = memoryBox(true)
    const leaked = { enc: box.encrypt("sk-real"), plain: "sk-leaked" }
    expect(leftoverPlain(leaked)).toBe(true)
    const scrubbed = scrubSecretDisk(leaked)
    expect(scrubbed).toEqual({ enc: leaked.enc })
    expect("plain" in scrubbed).toBe(false)
    expect(unpackSecret(scrubbed, box)).toBe("sk-real")
    expect(unpackSecret(scrubSecretDisk({ plain: "sk-leaked" }), box)).toBe("")
    const packed = packSecret("sk-real", box)
    expect("plain" in packed).toBe(false)
  })

  it("does not keep a plain field on SecretDisk or in the store load path", () => {
    const secrets = readFileSync(join(process.cwd(), "src/shared/secrets.ts"), "utf8")
    const store = readFileSync(join(process.cwd(), "src/main/store.ts"), "utf8")
    expect(secrets).not.toMatch(/plain\?:/)
    expect(store).not.toMatch(/plain\?:/)
    expect(store).toContain("leftoverPlain")
    expect(store).toContain("scrubSecretDisk")
    expect(store).toMatch(/if \(leftoverPlain\(raw\)\)/)
    expect(store).toMatch(/writeFileSync\(secretsFile\(\)/)
  })
})
