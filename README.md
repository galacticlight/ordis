# Ordis

A real-time desktop AI companion. You are the **Operator**. Ordis is the loyal ship cephalon of this habitat: a cracked glass hexahedron that lives always-on-top, speaks in a fussy steward's voice, and occasionally bleeds through as **Ordan Karris** — a short ALL-CAPS shard, then an immediate apology.

Inspired by Cephalon Ordis from [Warframe](https://wiki.warframe.com/w/Ordis). This is an original companion: no ripped game assets, audio, trademarks-as-logos, or copied UI art.

> *I am Ordis, ship cephalon, a shadow of my former self.*

## Stack

**Electron 33 + Vite 5 (`electron-vite`) + Three.js + TypeScript.**

Tauri 2 was the preferred hypothesis, but this Linux box has GTK without WebKitGTK (`libwebkit2gtk`), which is required to compile and run a Tauri webview. Electron ships Chromium, so the overlay, transparent window, and WebGL cube actually build here. Personality, glitch, memory, and the OpenAI-compatible client live in `src/shared` and do not depend on Electron, so a later Tauri shell can reuse them.

## Quick start

```bash
git clone https://github.com/galacticlight/ordis.git
cd ordis
npm install
cp .env.example .env   # optional; Settings in the app is the supported key store
npm run dev
```

The overlay appears at the bottom-right: frameless, transparent, always-on-top, draggable from the gold chrome bar. Type to the Operator composer. Without an API key, Ordis still answers from local precepts so the cube stays alive.

### Production build

```bash
npm run build          # compile main, preload, renderer into ./out
npm run package        # optional: electron-builder --dir unpacked app
```

Headless CI runs `lint`, `typecheck`, `test`, and `build`. A full GUI needs a display (or `xvfb-run` on Linux).

### Make it actually talk

1. Open **Settings** on the overlay (gear).
2. Set an **OpenAI-compatible** chat-completions endpoint (`https://api.openai.com/v1` or any local server that implements `/v1/chat/completions`).
3. Paste your API key. It is written to the OS user-data file `ordis-habitat.json` with mode `0600`. It is never hardcoded and never committed.
4. Set the model id your provider expects.

Optional env (dev only; Settings wins once saved):

```
ORDIS_API_BASE_URL=https://api.openai.com/v1
ORDIS_API_KEY=
ORDIS_MODEL=gpt-4o-mini
```

See `.env.example`. Do not put real secrets in git.

## What v1 does

| Must-have | Where |
|---|---|
| Native desktop overlay, always-on-top, draggable, idle tuck | `src/main/index.ts`, chrome bar tuck control |
| GPU cube + radio-wave ripples while speaking, vsync rAF, idle half-rate | `src/renderer/src/avatar/OrdisAvatar.ts` |
| Streaming chat (live tokens; offline word-stream) | `src/shared/llm/openaiCompatible.ts`, main chat loop |
| Personality + glitch engine (precepts, not a generic bot) | `src/shared/personality/*` |
| Local Operator memory | `src/shared/memory/operatorMemory.ts` |
| Status: idle / listening / thinking / speaking | overlay pill + cube uniforms |
| Settings for keys; offline fallback lines | Settings panel; `fallbacks.ts` |
| Voice in / speech out stubs | Web Speech API + speechSynthesis, gated in Settings |

### Voice path (stub)

- **In:** enable *Voice in (Web Speech stub)* then tap the mic. Chromium SpeechRecognition fills the composer.
- **Out:** enable *Voice out*; finished replies speak via speechSynthesis (glitch outbursts stripped so the Beast does not shout).
- Swap later for whisper.cpp / Piper without touching the personality engine: the main process already streams tokens independently of TTS.

## Architecture

```
src/
  main/           Electron main: overlay window, IPC, persistence, LLM stream
  preload/        contextBridge (no node in the renderer)
  renderer/       overlay UI + Three.js cube
  shared/
    personality/  precepts, glitch splice, idle, offline lines, engine
    llm/          OpenAI-compatible SSE client
    memory/       Operator preferences
    types.ts
tests/            vitest — glitch formatting, precepts, memory, SSE parser
```

- **UI thread:** rAF cube + DOM. No LLM work. Tokens arrive over IPC.
- **Idle:** cube skips every other frame, backgroundThrottling on, WebGL low-power.
- **Glitch:** `injectGlitch` cuts a calm clause with ` — ALL CAPS — ` plus an immediate correction. Offline replies use it; live models are instructed by precepts to do the same.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Electron + Vite overlay |
| `npm test` | Unit tests |
| `npm run lint` | ESLint |
| `npm run typecheck` | tsc --noEmit |
| `npm run build` | Production compile to `out/` |
| `npm run package` | Unpacked desktop dir via electron-builder |

## License

MIT (c) 2026 Prince Thai
