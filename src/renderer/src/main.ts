import type { AppSettings, CompanionStatus } from '@shared/types'
import { OrdisAvatar } from './avatar/OrdisAvatar'

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id)
  if (!el) {
    throw new Error(`Missing #${id}`)
  }
  return el as T
}

const habitat = $<HTMLDivElement>('app')
const canvas = $<HTMLCanvasElement>('cube')
const log = $<HTMLDivElement>('log')
const caption = $<HTMLDivElement>('caption')
const input = $<HTMLInputElement>('input')
const form = $<HTMLFormElement>('composer')
const pill = $<HTMLSpanElement>('status-pill')
const chatPanel = $<HTMLElement>('chat-panel')
const settingsPanel = $<HTMLElement>('settings-panel')
const micBtn = $<HTMLButtonElement>('btn-mic')

const avatar = new OrdisAvatar(canvas)
avatar.start()

let status: CompanionStatus = 'idle'
let streaming = ''
let streamBubble: HTMLDivElement | null = null
let tucked = false
let recognition: SpeechRecognitionStub | null = null
let voiceOut = false
let voiceIn = false

interface SpeechRecognitionStub {
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: { results: { 0: { 0: { transcript: string } } } }) => void) | null
  onend: (() => void) | null
  continuous: boolean
  interimResults: boolean
  lang: string
}

function setStatus(next: CompanionStatus): void {
  status = next
  pill.dataset.status = next
  pill.textContent = next
  avatar.setStatus(next)
}

function appendBubble(role: 'operator' | 'ordis', text: string, glitched = false): HTMLDivElement {
  const el = document.createElement('div')
  el.className = `bubble ${role}`
  const who = document.createElement('span')
  who.className = 'who'
  who.textContent = role === 'operator' ? 'Operator' : glitched ? 'Ordis · fragment' : 'Ordis'
  if (glitched) {
    who.classList.add('glitch-flag')
    avatar.pulseGlitch()
  }
  const body = document.createElement('div')
  body.textContent = text
  el.append(who, body)
  log.append(el)
  log.scrollTop = log.scrollHeight
  return el
}

function updateStream(token: string): void {
  streaming += token
  caption.textContent = streaming.slice(-180)
  if (!streamBubble) {
    streamBubble = appendBubble('ordis', '')
  }
  const body = streamBubble.lastElementChild
  if (body) {
    body.textContent = streaming
  }
  log.scrollTop = log.scrollHeight
}

function finishStream(content: string, glitched: boolean): void {
  streaming = ''
  if (streamBubble) {
    const who = streamBubble.querySelector('.who')
    const body = streamBubble.lastElementChild
    if (who) {
      who.textContent = glitched ? 'Ordis · fragment' : 'Ordis'
      who.classList.toggle('glitch-flag', glitched)
    }
    if (body) {
      body.textContent = content
    }
    if (glitched) {
      avatar.pulseGlitch()
    }
  }
  streamBubble = null
  caption.textContent = content.slice(0, 160)
  speakOut(content)
}

function speakOut(text: string): void {
  if (!voiceOut || typeof window.speechSynthesis === 'undefined') {
    return
  }
  window.speechSynthesis.cancel()
  const utter = new SpeechSynthesisUtterance(text.replace(/\s[—–-]\s+[A-Z][A-Z\s]+\s+[—–-]\s+/g, ' '))
  utter.rate = 1.02
  utter.pitch = 1.15
  window.speechSynthesis.speak(utter)
}

function isBridge(): boolean {
  return typeof window.ordis !== 'undefined'
}

async function boot(): Promise<void> {
  if (!isBridge()) {
    caption.textContent = 'Ordis renderer is awake. Native bridge missing — overlay-only preview.'
    setStatus('idle')
    return
  }

  window.ordis.onStatus(setStatus)
  window.ordis.onToken(updateStream)
  window.ordis.onDone(({ content, glitched }) => {
    finishStream(content, glitched)
  })
  window.ordis.onError((message) => {
    appendBubble('ordis', message)
    caption.textContent = message
  })
  window.ordis.onGreeting((text) => {
    appendBubble('ordis', text)
    caption.textContent = text
  })

  const settings = await window.ordis.getSettings()
  fillSettings(settings)
  voiceOut = settings.voiceOutEnabled
  voiceIn = settings.voiceInEnabled
}

function el(id: string): HTMLInputElement {
  return $<HTMLInputElement>(id)
}

function fillSettings(settings: AppSettings): void {
  el('set-url').value = settings.apiBaseUrl
  el('set-key').value = settings.apiKey
  el('set-model').value = settings.model
  el('set-glitch').checked = settings.glitchEnabled
  el('set-chance').value = String(Math.round(settings.glitchChance * 100))
  el('set-top').checked = settings.alwaysOnTop
  el('set-voice-in').checked = settings.voiceInEnabled
  el('set-voice-out').checked = settings.voiceOutEnabled
}

form.addEventListener('submit', (event) => {
  event.preventDefault()
  const text = input.value.trim()
  if (text.length === 0) {
    return
  }
  input.value = ''
  streaming = ''
  streamBubble = null
  appendBubble('operator', text)
  caption.textContent = '…'
  if (isBridge()) {
    void window.ordis.chat(text)
  } else {
    appendBubble('ordis', 'Native bridge offline. Launch via the desktop shell, Operator.')
  }
})

$('btn-settings').addEventListener('click', () => {
  const hide = !settingsPanel.classList.contains('hidden')
  settingsPanel.classList.toggle('hidden', hide)
  chatPanel.classList.toggle('hidden', !hide)
})

$('btn-tuck').addEventListener('click', () => {
  tucked = !tucked
  habitat.classList.toggle('tucked', tucked)
  if (isBridge()) {
    void window.ordis.setTuck(tucked)
  }
})

$('btn-save').addEventListener('click', () => {
  if (!isBridge()) {
    $('settings-note').textContent = 'Save requires the desktop shell.'
    return
  }
  const chance = Number($<HTMLInputElement>('set-chance').value) / 100
  void window.ordis
    .saveSettings({
      apiBaseUrl: $<HTMLInputElement>('set-url').value.trim(),
      apiKey: $<HTMLInputElement>('set-key').value,
      model: $<HTMLInputElement>('set-model').value.trim(),
      glitchEnabled: $<HTMLInputElement>('set-glitch').checked,
      glitchChance: chance,
      alwaysOnTop: $<HTMLInputElement>('set-top').checked,
      voiceInEnabled: $<HTMLInputElement>('set-voice-in').checked,
      voiceOutEnabled: $<HTMLInputElement>('set-voice-out').checked
    })
    .then((saved) => {
      fillSettings(saved)
      voiceOut = saved.voiceOutEnabled
      voiceIn = saved.voiceInEnabled
      $('settings-note').textContent = 'Precepts stored in the habitat (user-data), Operator.'
    })
})

micBtn.addEventListener('click', () => {
  if (!voiceIn) {
    caption.textContent = 'Enable Voice in under Settings, Operator. The stub uses Web Speech.'
    return
  }
  toggleListen()
})

function toggleListen(): void {
  const Ctor = (window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionStub
    webkitSpeechRecognition?: new () => SpeechRecognitionStub
  }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionStub }).webkitSpeechRecognition

  if (!Ctor) {
    caption.textContent = 'This habitat has no Web Speech engine. Text remains the live path.'
    return
  }
  if (recognition) {
    recognition.stop()
    recognition = null
    setStatus('idle')
    return
  }
  recognition = new Ctor()
  recognition.lang = 'en-US'
  recognition.continuous = false
  recognition.interimResults = false
  recognition.onresult = (event) => {
    const text = event.results[0][0].transcript
    input.value = text
    form.requestSubmit()
  }
  recognition.onend = () => {
    recognition = null
    if (status === 'listening') {
      setStatus('idle')
    }
  }
  recognition.start()
  setStatus('listening')
}

void boot()

window.addEventListener('beforeunload', () => {
  avatar.dispose()
})
