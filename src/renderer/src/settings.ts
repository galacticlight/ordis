import './settings.css'
import type { PublicSettings } from '../../shared/types'

const apiBaseUrl = document.getElementById('apiBaseUrl') as HTMLInputElement
const apiKey = document.getElementById('apiKey') as HTMLInputElement
const model = document.getElementById('model') as HTMLInputElement
const alwaysOnTop = document.getElementById('alwaysOnTop') as HTMLInputElement
const clickThroughIdle = document.getElementById('clickThroughIdle') as HTMLInputElement
const captionsEnabled = document.getElementById('captionsEnabled') as HTMLInputElement
const voiceInEnabled = document.getElementById('voiceInEnabled') as HTMLInputElement
const voiceOutEnabled = document.getElementById('voiceOutEnabled') as HTMLInputElement
const keyStatus = document.getElementById('key-status') as HTMLParagraphElement
const note = document.getElementById('note') as HTMLParagraphElement
const saveBtn = document.getElementById('save') as HTMLButtonElement
const testBtn = document.getElementById('test') as HTMLButtonElement

function describeKey(settings: PublicSettings): string {
  return settings.hasApiKey
    ? 'A key is stored in the habitat (user-data). The overlay never receives it.'
    : 'No key stored. Ordis will speak from local precepts.'
}

async function load(): Promise<void> {
  const s = await window.ordis.getSettings()
  apiBaseUrl.value = s.apiBaseUrl
  model.value = s.model
  alwaysOnTop.checked = s.alwaysOnTop
  clickThroughIdle.checked = s.clickThroughIdle
  captionsEnabled.checked = s.captionsEnabled
  voiceInEnabled.checked = s.voiceInEnabled
  voiceOutEnabled.checked = s.voiceOutEnabled
  apiKey.value = ''
  keyStatus.textContent = describeKey(s)
}

saveBtn.addEventListener('click', async () => {
  const patch: Parameters<typeof window.ordis.saveSettings>[0] = {
    apiBaseUrl: apiBaseUrl.value.trim(),
    model: model.value.trim(),
    alwaysOnTop: alwaysOnTop.checked,
    clickThroughIdle: clickThroughIdle.checked,
    captionsEnabled: captionsEnabled.checked,
    voiceInEnabled: voiceInEnabled.checked,
    voiceOutEnabled: voiceOutEnabled.checked
  }
  const typed = apiKey.value.trim()
  if (typed) {
    patch.apiKey = typed
  }
  const saved = await window.ordis.saveSettings(patch)
  apiKey.value = ''
  keyStatus.textContent = describeKey(saved)
  note.textContent = 'It is done. Settings stored in the habitat.'
})

testBtn.addEventListener('click', async () => {
  note.textContent = 'Consulting the vocalizer…'
  const result = await window.ordis.testConnection()
  note.textContent = result.ok
    ? 'Vocalizer link is sound. Wonderful.'
    : `Vocalizer quiet: ${result.error ?? 'unknown fault'}`
})

void load()
