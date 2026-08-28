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

function resize(): void {
  const box = canvas.getBoundingClientRect()
  scene.resize(Math.max(1, box.width), Math.max(1, box.height))
}

function setInteractiveUi(next: boolean): void {
  document.body.classList.toggle('interactive', next)
  document.body.classList.toggle('idle', !next)
  form.hidden = !next
  chrome.hidden = !next
  if (next) promptInput.focus()
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
})
window.ordis.onCaptions((enabled) => {
  captionsEnabled = enabled
  if (!enabled) caption.hidden = true
})
setInteractiveUi(false)
void window.ordis.ready()
