import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { KOKORO_MODEL_ID, KOKORO_VOICE, KOKORO_VOICES, kokoroVoice } from "../src/main/kokoro"

describe("kokoro vocalizer", () => {
  it("only allows owned Apache voices am_michael and am_puck", () => {
    expect(KOKORO_VOICE).toBe("am_michael")
    expect([...KOKORO_VOICES].sort()).toEqual(["am_michael", "am_puck"])
    expect(kokoroVoice("am_puck")).toBe("am_puck")
    expect(kokoroVoice("af_bella")).toBe("am_michael")
    expect(KOKORO_MODEL_ID).toContain("Kokoro-82M")
    const src = readFileSync(join(process.cwd(), "src/main/kokoro.ts"), "utf8")
    expect(src.toLowerCase()).not.toMatch(/warframe|digital extremes|de voice|beast of bones/)
    const tts = readFileSync(join(process.cwd(), "src/main/tts.ts"), "utf8")
    expect(tts).toContain("synthesizeKokoro")
    expect(tts).toContain("kokoroReady")
    const profile = JSON.parse(
      readFileSync(join(process.cwd(), "personality/voice.profile.json"), "utf8")
    ) as { speaker: string; voices: string[] }
    expect(profile.speaker).toBe("kokoro-am_michael")
    expect(profile.voices).toEqual(["am_michael", "am_puck"])
  })
})
