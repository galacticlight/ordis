import './settings.css'
import { HARBOR_API_BASE_URL, HARBOR_MODEL, type PublicSettings } from '../../shared/types'

const OPENAI_API_BASE_URL = 'https://api.openai.com/v1'
const OPENAI_MODEL = 'gpt-4o-mini'

const apiBaseUrl = document.getElementById('apiBaseUrl') as HTMLInputElement
const apiKey = document.getElementById('apiKey') as HTMLInputElement
const model = document.getElementById('model') as HTMLInputElement
const preset = document.getElementById('preset') as HTMLSelectElement
const alwaysOnTop = document.getElementById('alwaysOnTop') as HTMLInputElement
const clickThroughIdle = document.getElementById('clickThroughIdle') as HTMLInputElement
const captionsEnabled = document.getElementById('captionsEnabled') as HTMLInputElement
const voiceOutEnabled = document.getElementById('voiceOutEnabled') as HTMLInputElement
const keyStatus = document.getElementById('key-status') as HTMLParagraphElement
const note = document.getElementById('note') as HTMLParagraphElement
const saveBtn = document.getElementById('save') as HTMLButtonElement
const testBtn = document.getElementById('test') as HTMLButtonElement

function describeKey(settings: PublicSettings): string {
  return settings.hasApiKey
    ? 'A key is stored in the habitat (user-data). The overlay never receives it.'
    : 'No key stored. Ordis will speak from local precepts. Harbor is optional.'
}

function detectPreset(base: string, modelId: string): string {
  if (base === HARBOR_API_BASE_URL && modelId === HARBOR_MODEL) return 'harbor'
  if (base === OPENAI_API_BASE_URL && modelId === OPENAI_MODEL) return 'openai'
  return 'custom'
}

function applyPreset(id: string): void {
  if (id === 'harbor') {
    apiBaseUrl.value = HARBOR_API_BASE_URL
    model.value = HARBOR_MODEL
    return
  }
  if (id === 'openai') {
    apiBaseUrl.value = OPENAI_API_BASE_URL
    model.value = OPENAI_MODEL
  }
}

preset.addEventListener('change', () => applyPreset(preset.value))
apiBaseUrl.addEventListener('input', () => {
  preset.value = detectPreset(apiBaseUrl.value.trim(), model.value.trim())
})
model.addEventListener('input', () => {
  preset.value = detectPreset(apiBaseUrl.value.trim(), model.value.trim())
})

async function load(): Promise<void> {
  const s = await window.ordis.getSettings()
  apiBaseUrl.value = s.apiBaseUrl
  model.value = s.model
  preset.value = detectPreset(s.apiBaseUrl, s.model)
  alwaysOnTop.checked = s.alwaysOnTop
  clickThroughIdle.checked = s.clickThroughIdle
  captionsEnabled.checked = s.captionsEnabled
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
    voiceOutEnabled: voiceOutEnabled.checked
  }
  const typed = apiKey.value.trim()
  if (typed) {
    patch.apiKey = typed
  }
  try {
    const saved = await window.ordis.saveSettings(patch)
    apiKey.value = ''
    keyStatus.textContent = describeKey(saved)
    note.textContent = 'It is done. Settings stored in the habitat.'
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not store precepts.'
    note.textContent = message
  }
})

testBtn.addEventListener('click', async () => {
  note.textContent = 'Consulting the vocalizer…'
  const result = await window.ordis.testConnection()
  note.textContent = result.ok
    ? 'Vocalizer link is sound. Wonderful.'
    : `Vocalizer quiet: ${result.error ?? 'unknown fault'}`
})

void load()
