import { app, BrowserWindow, ipcMain, screen, shell } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { streamChatCompletion, LlmError } from '@shared/llm/openaiCompatible'
import { ingestOperatorUtterance, rememberNote } from '@shared/memory/operatorMemory'
import {
  composeMessages,
  greeting,
  newMessage,
  offlineReply,
  streamText
} from '@shared/personality/engine'
import { looksLikeApiConfigured } from '@shared/personality/fallbacks'
import { hasGlitchFormatting } from '@shared/personality/glitch'
import { DEFAULT_SETTINGS, type AppSettings, type CompanionStatus } from '@shared/types'
import { HabitatStore, habitatPath } from './store'

const OVERLAY = {
  expanded: { width: 380, height: 560 },
  tucked: { width: 196, height: 228 }
} as const

let overlay: BrowserWindow | null = null
let status: CompanionStatus = 'idle'
let abort: AbortController | null = null
const history: ReturnType<typeof newMessage>[] = []

const store = new HabitatStore(habitatPath(app.getPath('userData')))
const state = store.load()

function send(channel: string, payload?: unknown): void {
  overlay?.webContents.send(channel, payload)
}

function setStatus(next: CompanionStatus): void {
  status = next
  send('ordis:status', status)
}

function persist(): void {
  store.save(state)
}

function applyEnvOverrides(settings: AppSettings): AppSettings {
  const next = { ...settings }
  const envUrl = process.env.ORDIS_API_BASE_URL
  const envKey = process.env.ORDIS_API_KEY
  const envModel = process.env.ORDIS_MODEL
  if (!next.apiBaseUrl && envUrl) {
    next.apiBaseUrl = envUrl
  }
  if (!next.apiKey && envKey) {
    next.apiKey = envKey
  }
  if (envModel && next.model === DEFAULT_SETTINGS.model) {
    next.model = envModel
  }
  return next
}

function redact(settings: AppSettings): AppSettings {
  if (!settings.apiKey) {
    return settings
  }
  const visible =
    settings.apiKey.length <= 8
      ? '********'
      : `${settings.apiKey.slice(0, 3)}***${settings.apiKey.slice(-2)}`
  return { ...settings, apiKey: visible }
}

async function createOverlay(): Promise<void> {
  const display = screen.getPrimaryDisplay().workArea
  const { width, height } = OVERLAY.expanded
  overlay = new BrowserWindow({
    width,
    height,
    x: display.x + display.width - width - 24,
    y: display.y + display.height - height - 24,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    alwaysOnTop: state.settings.alwaysOnTop,
    skipTaskbar: true,
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: true
    }
  })

  overlay.setAlwaysOnTop(state.settings.alwaysOnTop, 'screen-saver')
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  overlay.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  overlay.on('ready-to-show', () => {
    overlay?.showInactive()
    send('ordis:greeting', greeting())
    setStatus('idle')
  })

  overlay.on('closed', () => {
    overlay = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    await overlay.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    const file = join(__dirname, '../renderer/index.html')
    await overlay.loadURL(pathToFileURL(file).toString())
  }
}

function placeTucked(tucked: boolean): void {
  if (!overlay) {
    return
  }
  const display = screen.getPrimaryDisplay().workArea
  const size = tucked ? OVERLAY.tucked : OVERLAY.expanded
  overlay.setSize(size.width, size.height)
  overlay.setPosition(display.x + display.width - size.width - 16, display.y + 16)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function speakOffline(operatorText: string): Promise<void> {
  const result = offlineReply(operatorText, {
    apiKey: state.settings.apiKey,
    apiBaseUrl: state.settings.apiBaseUrl,
    glitchEnabled: state.settings.glitchEnabled,
    glitchChance: state.settings.glitchChance
  })
  setStatus('speaking')
  for (const chunk of streamText(result.text)) {
    if (chunk.type === 'token') {
      send('ordis:token', chunk.value)
      await sleep(18)
    }
  }
  history.push(newMessage('ordis', result.text, result.glitched))
  send('ordis:done', { content: result.text, glitched: result.glitched })
  setStatus('idle')
}

async function speakLive(operatorText: string): Promise<void> {
  const messages = composeMessages(state.memory, history, operatorText)
  abort = new AbortController()
  setStatus('thinking')
  let assembled = ''
  let first = true
  try {
    for await (const token of streamChatCompletion({
      apiBaseUrl: state.settings.apiBaseUrl,
      apiKey: state.settings.apiKey,
      model: state.settings.model,
      temperature: state.settings.temperature,
      messages,
      signal: abort.signal
    })) {
      if (first) {
        setStatus('speaking')
        first = false
      }
      assembled += token
      send('ordis:token', token)
    }
  } catch (error) {
    if (abort.signal.aborted) {
      return
    }
    const message =
      error instanceof LlmError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Unknown vocalizer fault'
    send(
      'ordis:error',
      `Operator, the live link failed. ${message} Ordis will speak from local precepts.`
    )
    await speakOffline(operatorText)
    return
  }

  const glitched = hasGlitchFormatting(assembled)
  history.push(newMessage('ordis', assembled, glitched))
  send('ordis:done', { content: assembled, glitched })
  setStatus('idle')
}

function registerIpc(): void {
  ipcMain.handle('ordis:chat', async (_event, text: string) => {
    const value = (text ?? '').trim()
    if (value.length === 0) {
      return
    }
    abort?.abort()
    history.push(newMessage('operator', value))
    state.memory = ingestOperatorUtterance(state.memory, value)
    persist()
    const keyed = looksLikeApiConfigured(state.settings.apiKey, state.settings.apiBaseUrl)
    if (!keyed) {
      await speakOffline(value)
      return
    }
    await speakLive(value)
  })

  ipcMain.handle('ordis:abort', () => {
    abort?.abort()
    setStatus('idle')
  })

  ipcMain.handle('ordis:settings:get', () => redact(applyEnvOverrides(state.settings)))

  ipcMain.handle('ordis:settings:save', (_event, patch: Partial<AppSettings>) => {
    const next = { ...state.settings, ...patch }
    if (typeof next.apiKey === 'string' && next.apiKey.includes('***')) {
      next.apiKey = state.settings.apiKey
    }
    state.settings = next
    persist()
    overlay?.setAlwaysOnTop(state.settings.alwaysOnTop, 'screen-saver')
    return redact(state.settings)
  })

  ipcMain.handle('ordis:memory:get', () => state.memory)

  ipcMain.handle('ordis:memory:remember', (_event, note: string) => {
    state.memory = rememberNote(state.memory, String(note ?? ''))
    persist()
    return state.memory
  })

  ipcMain.handle('ordis:history:get', () => history)

  ipcMain.handle('ordis:tuck', (_event, tucked: boolean) => {
    state.settings.idleTuck = tucked
    persist()
    placeTucked(tucked)
  })

  ipcMain.handle('ordis:ignore-mouse', (_event, ignore: boolean) => {
    overlay?.setIgnoreMouseEvents(Boolean(ignore), { forward: true })
  })
}

app.commandLine.appendSwitch('enable-transparent-visuals')

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (overlay) {
      if (overlay.isMinimized()) {
        overlay.restore()
      }
      overlay.show()
      overlay.focus()
    }
  })

  void app.whenReady().then(async () => {
    state.settings = applyEnvOverrides(state.settings)
    registerIpc()
    await createOverlay()
  })

  app.on('window-all-closed', () => {
    app.quit()
  })
}

