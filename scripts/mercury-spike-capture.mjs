import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = process.env.SPIKE_OUT || resolve(root, 'spike/out')
const port = Number(process.env.SPIKE_PORT || 5179)
const cdpPort = Number(process.env.SPIKE_CDP || 9333)
const frames = Number(process.env.SPIKE_FRAMES || 72)

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}

async function waitHttp(url, timeout = 20000) {
  const start = Date.now()
  let last = ''
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(url)
      if (res.ok) return
      last = String(res.status)
    } catch (err) {
      last = err instanceof Error ? err.message : String(err)
    }
    await sleep(150)
  }
  throw new Error(`timeout waiting for ${url}: ${last}`)
}

function send(ws, id, method, params) {
  return new Promise((resolveSend, reject) => {
    const onmsg = (event) => {
      const msg = JSON.parse(String(event.data))
      if (msg.id !== id) return
      ws.removeEventListener('message', onmsg)
      if (msg.error) reject(new Error(`${method}: ${JSON.stringify(msg.error)}`))
      else resolveSend(msg.result)
    }
    ws.addEventListener('message', onmsg)
    ws.send(JSON.stringify({ id, method, params }))
  })
}

async function waitExpression(ws, expression, timeout = 25000) {
  const start = Date.now()
  let last = 'pending'
  let nextId = 20
  while (Date.now() - start < timeout) {
    const result = await send(ws, nextId, 'Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: false
    })
    nextId += 1
    const value = result?.result?.value
    if (value) return value
    last = JSON.stringify(result?.result ?? result)
    await sleep(250)
  }
  throw new Error(`expression never became truthy: ${expression} last=${last}`)
}

async function capture(mode, debugPort) {
  const url = `http://127.0.0.1:${port}/?mode=${mode}&frames=${frames}`
  const userData = `/tmp/ordis-spike-chrome-${mode}-${Date.now()}`
  const chrome = spawn(
    'google-chrome',
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      `--remote-debugging-port=${debugPort}`,
      '--remote-allow-origins=*',
      `--user-data-dir=${userData}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--ignore-gpu-blocklist',
      '--enable-webgl',
      '--enable-unsafe-swiftshader',
      '--use-angle=swiftshader-webgl',
      '--window-size=980,760',
      url
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  )
  let stderr = ''
  chrome.stderr.on('data', (chunk) => {
    stderr += String(chunk)
  })
  try {
    await waitHttp(`http://127.0.0.1:${debugPort}/json/version`)
    const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()
    const page = targets.find((item) => String(item.url || '').includes('5179')) || targets.find((item) => item.type === 'page') || targets[0]
    if (!page?.webSocketDebuggerUrl) throw new Error(`no page target: ${JSON.stringify(targets)}`)
    const ws = new WebSocket(page.webSocketDebuggerUrl)
    await new Promise((resolveOpen, reject) => {
      ws.addEventListener('open', resolveOpen)
      ws.addEventListener('error', reject)
    })
    await send(ws, 1, 'Runtime.enable')
    await send(ws, 2, 'Page.enable')
    const logs = []
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(String(event.data))
      if (msg.method === 'Runtime.consoleAPICalled' || msg.method === 'Runtime.exceptionThrown') {
        logs.push(msg)
      }
    })
    try {
      var report = await waitExpression(ws, 'window.__SPIKE_REPORT__')
    } catch (err) {
      const diag = await send(ws, 50, 'Runtime.evaluate', {
        expression: "JSON.stringify({title: document.title, results: document.getElementById('results') && document.getElementById('results').textContent, err: window.__SPIKE_ERROR__, href: location.href})",
        returnByValue: true
      })
      throw new Error(`${err.message} diag=${diag?.result?.value} logs=${JSON.stringify(logs).slice(0, 4000)}`)
    }
    const shot = await send(ws, 3, 'Page.captureScreenshot', { format: 'png', fromSurface: true })
    ws.close()
    return { report, png: Buffer.from(shot.data, 'base64'), stderr }
  } finally {
    chrome.kill('SIGKILL')
    await sleep(200)
  }
}

await mkdir(outDir, { recursive: true })
const vite = spawn('npx', ['vite', '--config', 'spike/vite.config.ts', '--host', '127.0.0.1', '--port', String(port)], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe']
})
let viteLog = ''
vite.stdout.on('data', (chunk) => {
  viteLog += String(chunk)
})
vite.stderr.on('data', (chunk) => {
  viteLog += String(chunk)
})
try {
  await waitHttp(`http://127.0.0.1:${port}/`)
  const idle = await capture('idle', cdpPort)
  const speak = await capture('speak', cdpPort + 1)
  await writeFile(resolve(outDir, 'idle.png'), idle.png)
  await writeFile(resolve(outDir, 'speak.png'), speak.png)
  const summary = {
    capturedAt: new Date().toISOString(),
    frames,
    idle: idle.report,
    speak: speak.report
  }
  await writeFile(resolve(outDir, 'bench.json'), JSON.stringify(summary, null, 2))
  console.log(JSON.stringify(summary, null, 2))
  console.log(`wrote ${outDir}`)
} catch (err) {
  console.error(viteLog)
  throw err
} finally {
  vite.kill('SIGKILL')
}
