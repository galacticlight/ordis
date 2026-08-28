import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, session, Tray, screen, shell, type NativeImage, type Session } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { AppSettings, ChatMessage, PublicSettings } from '../shared/types'
import { DEFAULT_MEMORY, DEFAULT_SETTINGS, type OperatorMemory } from '../shared/types'
import { canonicalReply, composeMessages, greeting, LiveCaptionGuard, newMessage, offlineReply, streamText } from '../shared/personality/engine'
import { loadPersonalityPack } from '../shared/personality/pack'
import { guardOutgoing } from '../shared/personality/traps'
import { ingestOperatorUtterance } from '../shared/memory/operatorMemory'
import { health, streamChatCompletion, LlmError } from '../shared/llm/provider'
import { loadMemory, loadSettings, saveMemory, saveSettings, toPublicSettings } from './store'
import { PlaintextKeyRefused } from '../shared/secrets'
import { cancelTtsQueue, enqueueSynthesize, ttsAvailable } from './tts'
import { canSpeak, consumeGreeting, createVoiceGate, unlock } from '../shared/audio/voiceGate'
import { isHabitatRequestAllowed, overlayContentSecurityPolicy, type HabitatAllowOrigins } from '../shared/security/habitatRequest'

let overlay: BrowserWindow | null = null
let settingsWin: BrowserWindow | null = null
let tray: Tray | null = null
let settings: AppSettings = { ...DEFAULT_SETTINGS }
let memory: OperatorMemory = { ...DEFAULT_MEMORY, likes: [], dislikes: [], notes: [], facts: {} }
let history: ChatMessage[] = []
let abort: AbortController | null = null
let interactive = false
let pendingGreeting = ''
const voiceGate = createVoiceGate()

let habitatPinned = false

function vocalizerOrigin(): string | null {
  try {
    return new URL(settings.apiBaseUrl).origin
  } catch {
    return null
  }
}

function habitatAllowOrigins(): HabitatAllowOrigins {
  return {
    devOrigin: process.env.ELECTRON_RENDERER_URL || null,
    vocalizerOrigin: vocalizerOrigin()
  }
}

function pinHabitatSession(): Session {
  const ses = session.fromPartition('persist:ordis-habitat')
  if (habitatPinned) {
    return ses
  }
  habitatPinned = true
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  ses.webRequest.onBeforeRequest((details, callback) => {
    const allowed = isHabitatRequestAllowed(details.url, habitatAllowOrigins())
    callback(allowed ? {} : { cancel: true })
  })
  ses.webRequest.onHeadersReceived((details, callback) => {
    const csp = overlayContentSecurityPolicy(habitatAllowOrigins())
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    })
  })
  return ses
}

function isDev(): boolean {
  return Boolean(process.env.ELECTRON_RENDERER_URL)
}

function personalityDir(): string {
  const packaged = app.isPackaged ? join(process.resourcesPath, 'personality') : null
  const fromMain = join(__dirname, '../../personality')
  const fromCwd = join(process.cwd(), 'personality')
  for (const dir of [process.env.ORDIS_PERSONALITY_DIR, packaged, fromMain, fromCwd]) {
    if (dir && existsSync(join(dir, 'ordis.v1.yaml'))) return dir
  }
  return fromCwd
}

function preloadPath(): string {
  return join(__dirname, '../preload/index.js')
}

function sendOverlay(channel: string, payload: unknown): void {
  if (overlay && !overlay.isDestroyed()) overlay.webContents.send(channel, payload)
}

function loadPage(win: BrowserWindow, page: 'index' | 'settings'): void {
  const dev = process.env.ELECTRON_RENDERER_URL
  if (dev) {
    void win.loadURL(page === 'index' ? dev : `${dev}/${page}.html`)
    return
  }
  const file = join(__dirname, `../renderer/${page}.html`)
  void win.loadURL(pathToFileURL(file).toString())
}

function setClickThrough(ignore: boolean): void {
  if (!overlay || overlay.isDestroyed()) return
  if (ignore) overlay.setIgnoreMouseEvents(true, { forward: true })
  else overlay.setIgnoreMouseEvents(false)
}

function speakGreetingIfDue(): void {
  if (!pendingGreeting) return
  if (!consumeGreeting(voiceGate)) return
  speak(pendingGreeting)
}

function setInteractive(next: boolean): void {
  interactive = next
  setClickThrough(settings.clickThroughIdle && !interactive)
  sendOverlay('ordis:interactive', interactive)
  if (next) {
    unlock(voiceGate)
    speakGreetingIfDue()
    if (overlay && !overlay.isDestroyed()) {
      overlay.focus()
      overlay.webContents.focus()
    }
  }
}

function persist(): void {
  saveSettings(settings)
  saveMemory(memory)
}

function speak(text: string): void {
  if (!canSpeak(voiceGate) || !settings.voiceOutEnabled || !ttsAvailable()) return
  const trimmed = text.trim()
  if (!trimmed) return
  void enqueueSynthesize(trimmed).then((result) => {
    if (!result) return
    const pcm = Buffer.from(result.pcm.buffer, result.pcm.byteOffset, result.pcm.byteLength)
    sendOverlay('ordis:voice', { sampleRate: result.sampleRate, pcm })
  })
}

function speakLiveDelta(spoken: string, prefix: { value: string }): void {
  if (spoken.length > prefix.value.length && spoken.startsWith(prefix.value)) {
    speak(spoken.slice(prefix.value.length))
    prefix.value = spoken
    return
  }
  if (spoken !== prefix.value) {
    cancelTtsQueue()
    speak(spoken)
    prefix.value = spoken
  }
}

function createOverlay(): BrowserWindow {
  pinHabitatSession()
  const display = screen.getPrimaryDisplay().workArea
  const width = 420
  const height = 640
  const win = new BrowserWindow({
    width,
    height,
    x: display.x + display.width - width - 80,
    y: display.y + 32,
    frame: false,
    transparent: true,
    alwaysOnTop: settings.alwaysOnTop,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    fullscreenable: false,
    minimizable: false,
    maximizable: false,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: preloadPath(),
      partition: 'persist:ordis-habitat',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: true,
      devTools: isDev()
    }
  })
  win.setMenuBarVisibility(false)
  if (settings.alwaysOnTop) win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setIgnoreMouseEvents(true, { forward: true })
  win.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })
  loadPage(win, 'index')
  win.once('ready-to-show', () => win.showInactive())
  return win
}

function createSettings(): BrowserWindow {
  const win = new BrowserWindow({
    width: 520,
    height: 720,
    frame: true,
    show: false,
    autoHideMenuBar: true,
    title: 'Ordis — Settings',
    backgroundColor: '#14121c',
    webPreferences: {
      preload: preloadPath(),
      partition: 'persist:ordis-habitat',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: isDev()
    }
  })
  win.setMenuBarVisibility(false)
  loadPage(win, 'settings')
  win.on('close', (event) => {
    event.preventDefault()
    win.hide()
  })
  return win
}

function openSettings(): void {
  if (!settingsWin || settingsWin.isDestroyed()) settingsWin = createSettings()
  settingsWin.show()
  settingsWin.focus()
}

async function runChat(text: string): Promise<void> {
  const trimmed = text.trim()
  if (!trimmed) return
  abort?.abort()
  abort = new AbortController()
  cancelTtsQueue()
  memory = ingestOperatorUtterance(memory, trimmed)
  history.push(newMessage('operator', trimmed))
  sendOverlay('ordis:status', 'thinking')
  const config = { apiKey: settings.apiKey, apiBaseUrl: settings.apiBaseUrl }
  let full = ''
  try {
    const canned = canonicalReply(trimmed)
    if (canned || !settings.apiKey.trim() || !settings.apiBaseUrl.trim()) {
      full = guardOutgoing(canned ?? offlineReply(trimmed, config))
      sendOverlay('ordis:status', 'speaking')
      for (const chunk of streamText(full)) sendOverlay('ordis:chunk', chunk)
      speak(full)
    } else {
      sendOverlay('ordis:status', 'speaking')
      const messages = composeMessages(memory, history.slice(0, -1), trimmed)
      const live = new LiveCaptionGuard()
      const prefix = { value: '' }
      for await (const token of streamChatCompletion({
        apiBaseUrl: settings.apiBaseUrl,
        apiKey: settings.apiKey,
        model: settings.model,
        temperature: settings.temperature,
        messages,
        signal: abort.signal
      })) {
        for (const chunk of live.push(token)) sendOverlay('ordis:chunk', chunk)
        speakLiveDelta(live.text, prefix)
      }
      for (const chunk of live.finish()) sendOverlay('ordis:chunk', chunk)
      speakLiveDelta(live.text, prefix)
      full = live.text
    }
  } catch (error) {
    if (abort.signal.aborted) return
    const message = error instanceof LlmError ? error.message : error instanceof Error ? error.message : 'Vocalizer fault'
    full = guardOutgoing(`Operator, the live link failed (${message}). ${offlineReply(trimmed, config)}`)
    sendOverlay('ordis:status', 'speaking')
    for (const chunk of streamText(full)) sendOverlay('ordis:chunk', chunk)
    speak(full)
  }
  history.push(newMessage('ordis', full))
  if (history.length > 40) history = history.slice(-40)
  persist()
  sendOverlay('ordis:status', 'idle')
}

function trayIcon(): NativeImage {
  const candidates = [
    join(__dirname, '../../resources/icon.png'),
    join(process.cwd(), 'resources/icon.png'),
    typeof process.resourcesPath === 'string' ? join(process.resourcesPath, 'icon.png') : ''
  ]
  for (const file of candidates) {
    if (file && existsSync(file)) {
      const image = nativeImage.createFromPath(file)
      if (!image.isEmpty()) return image
    }
  }
  return nativeImage.createEmpty()
}

function registerIpc(): void {
  ipcMain.handle('settings:get', (): PublicSettings => toPublicSettings(settings))
  ipcMain.handle('settings:save', (_e, patch: Partial<PublicSettings> & { apiKey?: string }) => {
    const next: AppSettings = { ...settings }
    if (typeof patch.apiBaseUrl === 'string') next.apiBaseUrl = patch.apiBaseUrl.trim()
    if (typeof patch.model === 'string') next.model = patch.model.trim()
    if (typeof patch.temperature === 'number') next.temperature = patch.temperature
    if (typeof patch.alwaysOnTop === 'boolean') next.alwaysOnTop = patch.alwaysOnTop
    if (typeof patch.clickThroughIdle === 'boolean') next.clickThroughIdle = patch.clickThroughIdle
    if (typeof patch.captionsEnabled === 'boolean') next.captionsEnabled = patch.captionsEnabled
    if (typeof patch.chatterFrequency === 'number') next.chatterFrequency = patch.chatterFrequency
    if (typeof patch.voiceOutEnabled === 'boolean') next.voiceOutEnabled = patch.voiceOutEnabled
    next.voiceInEnabled = false
    if (typeof patch.apiKey === 'string' && patch.apiKey.trim()) next.apiKey = patch.apiKey.trim()
    const previous = settings
    try {
      settings = next
      persist()
    } catch (error) {
      settings = { ...next, apiKey: previous.apiKey }
      saveSettings(settings)
      if (error instanceof PlaintextKeyRefused) {
        throw error
      }
      throw error
    }
    overlay?.setAlwaysOnTop(settings.alwaysOnTop, 'screen-saver')
    setInteractive(interactive)
    if (!settings.voiceOutEnabled) cancelTtsQueue()
    sendOverlay('ordis:settings', toPublicSettings(settings))
    sendOverlay('ordis:captions', settings.captionsEnabled)
    return toPublicSettings(settings)
  })
  ipcMain.handle('settings:test', async () => {
    if (!settings.apiKey.trim()) return { ok: false, error: 'No key stored. Ordis will speak from local precepts.' }
    return health(settings.apiBaseUrl, settings.apiKey)
  })
  ipcMain.handle('chat:send', async (_e, text: string) => {
    await runChat(String(text ?? ''))
  })
  ipcMain.handle('overlay:set-interactive', (_e, next: boolean) => setInteractive(Boolean(next)))
  ipcMain.handle('overlay:open-settings', () => openSettings())
  ipcMain.handle('overlay:ready', () => {
    const greetingText = greeting()
    pendingGreeting = greetingText
    sendOverlay('ordis:greeting', greetingText)
    sendOverlay('ordis:status', 'idle')
    sendOverlay('ordis:interactive', interactive)
    sendOverlay('ordis:captions', settings.captionsEnabled)
    speakGreetingIfDue()
  })
  ipcMain.handle('app:quit', () => app.quit())
}

app.commandLine.appendSwitch('enable-transparent-visuals')

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  void app.whenReady().then(() => {
    loadPersonalityPack(personalityDir())
    settings = loadSettings()
    memory = loadMemory()
    registerIpc()
    Menu.setApplicationMenu(null)
    overlay = createOverlay()
    settingsWin = createSettings()
    tray = new Tray(trayIcon())
    tray.setToolTip('Ordis')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Interact', click: () => setInteractive(true) },
        { label: 'Settings…', click: () => openSettings() },
        { type: 'separator' },
        { label: 'Quit Ordis', click: () => app.quit() }
      ])
    )
    tray.on('click', () => setInteractive(!interactive))
    setInteractive(false)
    try {
      globalShortcut.register('CommandOrControl+Shift+O', () => setInteractive(!interactive))
      globalShortcut.register('CommandOrControl+,', () => openSettings())
    } catch {
      // headless / no accelerator host
    }
  })

  app.on('before-quit', () => {
    persist()
    if (settingsWin && !settingsWin.isDestroyed()) {
      settingsWin.removeAllListeners('close')
      settingsWin.close()
    }
  })
  app.on('window-all-closed', () => app.quit())
  app.on('will-quit', () => globalShortcut.unregisterAll())
}
