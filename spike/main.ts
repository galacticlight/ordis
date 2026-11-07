import { OrdisAvatar } from '../src/renderer/src/avatar/OrdisAvatar'

function mustCanvas(id: string): HTMLCanvasElement {
  const el = document.getElementById(id)
  if (!(el instanceof HTMLCanvasElement)) throw new Error(`missing #${id}`)
  return el
}

function stats(times: number[]): { median: number; mean: number; p95: number; n: number } {
  const sorted = [...times].sort((a, b) => a - b)
  const n = sorted.length
  const mean = sorted.reduce((a, b) => a + b, 0) / Math.max(1, n)
  const median = sorted[Math.floor(n / 2)] ?? 0
  const p95 = sorted[Math.min(n - 1, Math.floor(n * 0.95))] ?? 0
  return { median, mean, p95, n }
}

function line(label: string, s: { median: number; mean: number; p95: number; n: number }): string {
  const f = (n: number) => n.toFixed(2)
  return `${label}: median ${f(s.median)} ms, mean ${f(s.mean)} ms, p95 ${f(s.p95)} ms (n=${s.n})`
}

const mesh = new OrdisAvatar(mustCanvas('mesh'), { renderPath: 'mesh' })
const ray = new OrdisAvatar(mustCanvas('raymarch'), { renderPath: 'raymarch' })
mesh.resize(420, 520)
ray.resize(420, 520)

const mode = new URLSearchParams(window.location.search).get('mode') === 'speak' ? 'speaking' : 'idle'
mesh.setStatus(mode)
ray.setStatus(mode)
if (mode === 'speaking') {
  mesh.setVoiceAmp(0.28)
  ray.setVoiceAmp(0.28)
  const pulse = (): void => {
    mesh.setVoiceAmp(0.18 + 0.12 * Math.abs(Math.sin(performance.now() / 280)))
    ray.setVoiceAmp(0.18 + 0.12 * Math.abs(Math.sin(performance.now() / 280)))
    requestAnimationFrame(pulse)
  }
  pulse()
}

const warmup = 8
const frames = Number(new URLSearchParams(window.location.search).get('frames') ?? 90)

function waitFrames(n: number): Promise<void> {
  return new Promise((resolve) => {
    const step = (left: number): void => {
      if (left <= 0) resolve()
      else requestAnimationFrame(() => step(left - 1))
    }
    step(n)
  })
}

async function run(): Promise<void> {
  await waitFrames(warmup)
  const meshTimes = mesh.sampleGpuFrames(frames)
  const rayTimes = ray.sampleGpuFrames(frames)
  const gl = mesh.renderer.getContext() as WebGLRenderingContext
  const dbg = gl.getExtension('WEBGL_debug_renderer_info')
  const report = {
    mode,
    frames,
    userAgent: navigator.userAgent,
    webglVendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    webglRenderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    mesh: stats(meshTimes),
    raymarch: stats(rayTimes)
  }
  const text = [
    `status=${mode}  frames=${frames}`,
    line('mesh', report.mesh),
    line('raymarch', report.raymarch),
    `ratio (ray/mesh median): ${(report.raymarch.median / Math.max(0.001, report.mesh.median)).toFixed(2)}x`,
    navigator.userAgent
  ].join('\n')
  const el = document.getElementById('results')
  if (el) el.textContent = text
  ;(window as unknown as { __SPIKE_REPORT__: unknown }).__SPIKE_REPORT__ = report
  document.title = `spike-ready ${mode}`
}

void run().catch((err: unknown) => {
  const text = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err)
  const el = document.getElementById('results')
  if (el) el.textContent = text
  ;(window as unknown as { __SPIKE_ERROR__: string }).__SPIKE_ERROR__ = text
  document.title = 'spike-error'
})
