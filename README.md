# Ordis Companion

A real-time desktop AI companion. You are the **Operator**. Ordis is the loyal ship cephalon of this habitat: a cream-and-gold Sentinel steward with cyan crescent eyes, an unbroken cube glyph, and radio-wave speech ripples.

Inspired by Cephalon Ordis from [Warframe](https://wiki.warframe.com/w/Ordis). This is an original companion: no ripped game assets, audio, trademarks-as-logos, or copied UI art.

> I am Ordis, ship Cephalon. I serve the Operator. I make new memories.

## Stack

**Electron 33 + Vite 5 (`electron-vite`) + Three.js + TypeScript.**

Tauri 2 was the preferred hypothesis, but this Linux box has GTK without WebKitGTK (`libwebkit2gtk`), which is required to compile and run a Tauri webview. Electron ships Chromium, so the overlay, transparent window, and WebGL cube actually build here. Personality, memory, and the OpenAI-compatible client live in `src/shared` and do not depend on Electron, so a later Tauri shell can reuse them.

## Quick start

```bash
git clone https://github.com/galacticlight/ordis.git
cd ordis
npm install
npm test
cp .env.example .env   # optional; Settings in the app is the supported key store
npm run dev
```

The overlay appears at the bottom-right: frameless, transparent, always-on-top, idle click-through; hover the Sentinel to speak. Type to the Operator composer. Ordis is offline-first: without an API key, he still greets, speaks locally, uses on-disk Operator memory, and answers from YAML personality precepts.

### Production build

```bash
npm run build          # compile main, preload, renderer into ./out
npm run package        # optional: electron-builder --dir unpacked app
```

Headless CI runs `lint`, `typecheck`, `test`, and `build`. A full GUI needs a display (or `xvfb-run` on Linux).

### Harbor (optional wider mind)

1. Open **Settings** on the overlay (gear).
2. **Grok / Harbor (xAI)** is the preset: base URL `https://api.x.ai/v1`, model `grok-4.6`.
3. Paste your xAI API key if you want Harbor. It is written to the OS user-data file `secrets.json` via safeStorage. Overlay prefs still save without a key.
4. LLM fetch stays in Electron main. The renderer never talks to api.x.ai. Overlay chat uses `/v1/chat/completions` with `reasoning_effort: "low"`.

Optional env (dev only; Settings wins once saved):

```
ORDIS_API_BASE_URL=https://api.x.ai/v1
ORDIS_API_KEY=
ORDIS_MODEL=grok-4.6
```

See `.env.example`. Do not put real secrets in git.

## What v1 does

| Must-have | Where |
|---|---|
| Native desktop overlay, always-on-top, draggable, idle tuck | `src/main/index.ts`, chrome bar tuck control |
| Sentinel body + unbroken cube glyph + speech ripples | `src/renderer/src/avatar/OrdisAvatar.ts` |
| Streaming chat (live tokens; unharbored word-stream) | `src/shared/llm/openaiCompatible.ts`, main chat loop |
| Personality pack (YAML precepts, not a generic bot) | `src/shared/personality/*` |
| Local Operator memory | `src/shared/memory/operatorMemory.ts` |
| Status: idle / listening / thinking / speaking | overlay caption + eye pulse |
| Settings for keys; unharbored local precepts | Settings panel; `fallbacks.ts` |
| On-device radio vocalizer (voice out) | Packaged Kokoro q8 am_michael + radio filter; espeak-ng fallback |

### Voice path

- **Out:** on-device Kokoro `am_michael` (Apache-2.0 q8 ONNX, voices `am_michael` / `am_puck` only) plus the radio filter. Packaged builds vendor the q8 weights and espeak-ng via `scripts/vendorVoiceExtras.cjs` into extraResources, so Ordis.app speaks without Homebrew and without a first-run model download. `am_puck` is the owned alternate. espeak-ng stays as fallback. No Digital Extremes audio.
- **In:** still dark. No mic, no Web Speech, no browser `speechSynthesis` stub. On-device STT can replace this later without touching the personality engine.
- Dev extras: run the vendor:voice script. Unpackaged Linux can use distro espeak-ng. The rest of the stack is Electron (Chromium), so the overlay does not need WebKitGTK.

## Architecture

```
src/
  main/           Electron main: overlay window, IPC, persistence, LLM stream, TTS
  preload/        contextBridge (no node in the renderer)
  renderer/       overlay UI + Three.js Sentinel and cube glyph
  shared/
    personality/  pack loader, precepts, idle, offline lines, engine, traps
    llm/          OpenAI-compatible SSE client
    memory/       Operator preferences
    audio/        WAV PCM helpers + radio filter
    types.ts
tests/            vitest — traps, loyalty, precepts, memory, SSE parser, radio DSP
```

- **UI thread:** rAF cube + DOM. No LLM work. Tokens arrive over IPC.
- **Idle:** cube skips every other frame, backgroundThrottling on, WebGL low-power.
- **Speech faults:** traps.ts detects capital-letter rage splices. Product is off; CI fails if they return. Asking to perform that voice is refused in-character.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Electron + Vite overlay |
| `npm test` | Unit tests |
| `npm run lint` | ESLint |
| `npm run typecheck` | tsc --noEmit |
| `npm run build` | Production compile to `out/` |
| `npm run package` | Unpacked desktop dir via electron-builder, after voice extras |

## License

MIT (c) 2026 Prince Thai
