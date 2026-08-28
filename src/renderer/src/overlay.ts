import './overlay.css'
import { OrdisAvatar } from './avatar/OrdisAvatar'
import type { CompanionStatus } from '../../shared/types'

function must<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id)
  if (!el) {
    throw new Error(`Missing #${id}`)
  }
  return el as T
}

const canvas = must<HTMLCanvasElement>('avatar')
const caption = must<HTMLDivElement>('caption')
const form = must<HTMLFormElement>('chat')
const promptInput = must<HTMLInputElement>('prompt')
const hit = must<HTMLDivElement>('hit')
const chrome = must<HTMLDivElement>('chrome')
const btnSettings = must<HTMLButtonElement>('btn-settings')
const btnTuck = must<HTMLButtonElement>('btn-tuck')

const scene = new OrdisAvatar(canvas)
let captionsEnabled = true
let spoken = ''
let audioCtx: AudioContext | null = null
const playbackQueue: AudioBuffer[] = []
let playing = false

function audioContext(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext()
  return audioCtx
}

function pcm16leToFloat32(pcm: Uint8Array): Float32Array {
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  const count = Math.floor(pcm.byteLength / 2)
  const out = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    out[i] = view.getInt16(i * 2, true) / 32768
  }
  return out
}

function pumpPlayback(): void {
  const ac = audioContext()
  if (ac.state !== 'running') {
    playing = false
    return
  }
  const next = playbackQueue.shift()
  if (!next) {
    playing = false
    return
  }
  playing = true
  const src = ac.createBufferSource()
  src.buffer = next
  src.connect(ac.destination)
  src.onended = () => {
    playing = false
    pumpPlayback()
  }
  src.start()
}

async function resumePlayback(): Promise<void> {
  const ac = audioContext()
  if (ac.state === 'suspended') {
    try {
      await ac.resume()
    } catch {
      return
    }
  }
  if (ac.state === 'running' && !playing && playbackQueue.length > 0) pumpPlayback()
}

function enqueueVoice(sampleRate: number, pcm: Uint8Array): void {
  if (pcm.byteLength < 2 || sampleRate < 1) return
  const ac = audioContext()
  const samples = pcm16leToFloat32(pcm)
  if (samples.length === 0) return
  const buf = ac.createBuffer(1, samples.length, sampleRate)
  buf.getChannelData(0).set(samples)
  playbackQueue.push(buf)
  void resumePlayback()
}

function resize(): void {
  const box = canvas.getBoundingClientRect()
  scene.resize(Math.max(1, box.width), Math.max(1, box.height))
}

function setInteractiveUi(next: boolean): void {
  document.body.classList.toggle('interactive', next)
  document.body.classList.toggle('idle', !next)
  // Do not toggle the HTML hidden attribute on chrome/chat: UA [hidden]
  // is display:none !important and fights body.interactive { display:flex }.
  form.removeAttribute('hidden')
  chrome.removeAttribute('hidden')
  if (next) {
    if (spoken) setCaption(spoken)
    promptInput.focus({ preventScroll: true })
  }
}

function setCaption(text: string): void {
  if (!captionsEnabled || text.trim().length === 0) {
    caption.hidden = true
    caption.textContent = ''
    return
  }
  caption.hidden = false
  caption.textContent = text
}

function wake(): void {
  void resumePlayback()
  setInteractiveUi(true)
  void window.ordis.setInteractive(true)
}

window.addEventListener('resize', resize)
new ResizeObserver(resize).observe(canvas)
resize()
hit.addEventListener('mouseenter', wake)
hit.addEventListener('click', wake)
caption.addEventListener('mouseenter', wake)
caption.addEventListener('click', wake)
form.addEventListener('submit', (event) => {
  event.preventDefault()
  const text = promptInput.value.trim()
  if (!text) return
  promptInput.value = ''
  spoken = ''
  setCaption('…')
  scene.setStatus('thinking')
  void window.ordis.sendChat(text)
})
btnSettings.addEventListener('click', () => {
  void window.ordis.openSettings()
})
btnTuck.addEventListener('click', () => {
  setInteractiveUi(false)
  void window.ordis.setInteractive(false)
})
window.ordis.onChunk((chunk) => {
  if (chunk.type === 'token') {
    spoken += chunk.value
    setCaption(spoken)
    scene.setStatus('speaking')
  } else if (chunk.type === 'done') {
    spoken = chunk.value
    setCaption(spoken)
  } else if (chunk.type === 'error') {
    setCaption(chunk.value)
  }
})
window.ordis.onStatus((status) => {
  scene.setStatus(status as CompanionStatus)
})
window.ordis.onGreeting((text) => {
  spoken = text
  setCaption(text)
})
window.ordis.onInteractive((next) => {
  setInteractiveUi(next)
  if (next) void resumePlayback()
})
window.ordis.onVoice((payload) => {
  const pcm = payload.pcm instanceof Uint8Array ? payload.pcm : new Uint8Array(payload.pcm)
  enqueueVoice(payload.sampleRate, pcm)
})
window.ordis.onCaptions((enabled) => {
  captionsEnabled = enabled
  if (!enabled) caption.hidden = true
})
setInteractiveUi(false)
void window.ordis.ready()
