import './overlay.css'
import { OrdisAvatar } from './avatar/OrdisAvatar'
import type { CompanionStatus } from '../../shared/types'

const canvas = document.getElementById('avatar') as HTMLCanvasElement
const caption = document.getElementById('caption') as HTMLDivElement
const form = document.getElementById('chat') as HTMLFormElement
const promptInput = document.getElementById('prompt') as HTMLInputElement
const hit = document.getElementById('hit') as HTMLDivElement
const chrome = document.getElementById('chrome') as HTMLDivElement
const btnSettings = document.getElementById('btn-settings') as HTMLButtonElement
const btnTuck = document.getElementById('btn-tuck') as HTMLButtonElement

const scene = new OrdisAvatar(canvas)
let captionsEnabled = true
let spoken = ''

function resize(): void {
  scene.resize(window.innerWidth, Math.max(320, window.innerHeight - 80))
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

window.addEventListener('resize', resize)
resize()
hit.addEventListener('mouseenter', () => {
  void window.ordis.setInteractive(true)
})
hit.addEventListener('click', () => {
  void window.ordis.setInteractive(true)
})
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
void window.ordis.ready()
setInteractiveUi(false)
