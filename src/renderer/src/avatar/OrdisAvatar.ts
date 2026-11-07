import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { CompanionStatus } from '../../../shared/types'
import {
  defaultMercuryBalls,
  integrateMercuryBall,
  type Vec3
} from './mercuryField'
import { createMercuryVolume, mercuryVolumeMaterial } from './mercuryRaymarch'

export const PALETTE = {
  ivory: 0xf4ebda,
  cream: 0xe4d5bc,
  gold: 0xc4a46a,
  goldHi: 0xe6d3a3,
  cyan: 0x7eb8b4,
  cyanHi: 0xb7e4e0,
  ink: 0x12110e
} as const

/** Idle / speak motion. Tune here; do not hunt through the loop. */
export const MOTION = {
  idleBreathWorld: 0.002,
  idleBreathPeriod: 12,
  /** Secondary / tertiary layers stay normalized so peak ≤ idleBreathWorld. */
  idleBreathSecondary: 0.34,
  idleBreathSecondaryPeriod: 7.3,
  idleBreathTertiary: 0.18,
  idleBreathTertiaryPeriod: 19.7,
  idlePrecessionRad: (2 * Math.PI) / 180,
  idlePrecessionPeriod: 20,
  /** Slow irregular drift mixed into yaw/pitch (weights sum ≤ 1 with primary). */
  idlePrecessionDrift: 0.22,
  idlePrecessionDriftPeriod: 33,
  corePulseHz: 0.15,
  corePulseAmt: 0.015,
  /** Extra emissive lift while speaking, scaled by voice envelope. */
  corePulseSpeakBoost: 0.012,
  listenHaloScale: 1.04,
  thinkSpinRadPerSec: (4 * Math.PI) / 180,
  speakRippleLife: 1.05,
  speakRippleGap: 1.05,
  /** Louder voice shortens the gap toward this floor (still ≥ life * speakRippleGapFloorFrac). */
  speakRippleGapFloorFrac: 0.72,
  speakRippleAmpGapScale: 0.38,
  speakEnvelope: 0.38,
  speakAmpGain: 5,
  speakAmpDecay: 3.2,
  speakAmpFloor: 0.45,
  /** How strongly live voiceAmp drives ripple opacity vs the speak floor. */
  voiceAmpToRipple: 0.9,
  /** Per-ring speed jitter (±); keeps propagation from looking mechanical. */
  speakRippleSpeedJitter: 0.08,
  /** Organic speak-floor wobble (radians/sec-ish via sin(t * hz)). */
  speakFloorWobbleA: 0.1,
  speakFloorWobbleHzA: 5.1,
  speakFloorWobbleB: 0.05,
  speakFloorWobbleHzB: 2.3,
  haloLerpPerSec: 4,
  idleIntensity: 0.4,
  idleMicroCaustic: 0.04,
  idleMicroCausticHzA: 0.7,
  idleMicroCausticHzB: 1.13,
  /** Raymarch spike: overdamped velocity decay (1/s). High = sluggish, not springy. */
  mercuryViscosity: 5.6,
  /** Weak restore toward rest; keep below viscosity so the blob does not bounce. */
  mercuryRestore: 1.6,
  mercuryNoiseSpeed: 0.055,
  mercuryBounds: 0.18,
  mercuryThreshold: 0.42,
  mercuryRippleDisplace: 0.055,
  mercurySteps: 56,
  mercuryIdleSteps: 36
} as const

export type AvatarRenderPath = 'mesh' | 'raymarch'

export type OrdisAvatarOptions = {
  renderPath?: AvatarRenderPath
}

export const OVERLAY_FRUSTUM = { width: 420, height: 640 } as const
export const SEAL_SIZE = 1
export const SEAL_POSITION = [0, 0.06, 0] as const
export const CAMERA_POSE = {
  fov: 30,
  position: [1.48, 0.92, 3.95] as const,
  lookAt: [0, 0.06, 0] as const
}

/** Hermite smoothstep on [0,1]. */
export function smoothstep01(x: number): number {
  const t = Math.min(1, Math.max(0, x))
  return t * t * (3 - 2 * t)
}

/** Soft attack/sustain/release from normalized life 0→1 (expanding ripple). */
export function rippleFadeEnvelope(life01: number): number {
  const life = Math.min(1, Math.max(0, life01))
  // Quick soft attack, then a smooth ease-out release (not linear).
  const attack = smoothstep01(life / 0.12)
  const release = 1 - smoothstep01((life - 0.18) / 0.82)
  return attack * Math.max(0, release)
}

/** Layered, amplitude-normalized breath offset in world units. */
export function idleBreathOffset(t: number): number {
  const w1 = 1
  const w2 = MOTION.idleBreathSecondary
  const w3 = MOTION.idleBreathTertiary
  const norm = w1 + w2 + w3
  const primary = Math.sin((t * Math.PI * 2) / MOTION.idleBreathPeriod)
  const secondary = Math.sin((t * Math.PI * 2) / MOTION.idleBreathSecondaryPeriod)
  const tertiary = Math.sin((t * Math.PI * 2) / MOTION.idleBreathTertiaryPeriod + 1.1)
  return ((w1 * primary + w2 * secondary + w3 * tertiary) / norm) * MOTION.idleBreathWorld
}

/** Slow precession with a quieter irregular drift so it is not a turntable. */
export function idlePrecession(t: number): { yaw: number; pitch: number } {
  const rad = MOTION.idlePrecessionRad
  const drift = MOTION.idlePrecessionDrift
  const primary = 1 - drift
  const yaw =
    Math.sin((t * Math.PI * 2) / MOTION.idlePrecessionPeriod) * rad * primary +
    Math.sin((t * Math.PI * 2) / MOTION.idlePrecessionDriftPeriod + 0.35) * rad * drift
  const pitch =
    Math.cos((t * Math.PI * 2) / (MOTION.idlePrecessionPeriod * 1.15)) * rad * 0.4 * primary +
    Math.cos((t * Math.PI * 2) / (MOTION.idlePrecessionDriftPeriod * 0.87) + 0.6) * rad * 0.15 * drift
  return { yaw, pitch }
}

/** Soft core pulse; speakAmp (0..1) lifts the peak gently. */
export function softCorePulse(t: number, speakAmp = 0): number {
  const wave = Math.sin(t * MOTION.corePulseHz * Math.PI * 2)
  // Soften peaks: mix sine with a flattened cousin so attack/release feel rounder.
  const soft = wave * 0.72 + Math.sin(wave * Math.PI * 0.5) * 0.28
  const speak = Math.min(1, Math.max(0, speakAmp)) * MOTION.corePulseSpeakBoost
  return 1 + soft * MOTION.corePulseAmt + speak
}

/** Peak-hold decay for voice RMS driving the mercury and ripples. */
export function decayVoiceAmp(amp: number, dt: number): number {
  return amp * Math.exp(-Math.max(0, dt) * MOTION.speakAmpDecay)
}

/** Map raw RMS into the avatar voice envelope (0..1). */
export function gainVoiceAmp(rms: number): number {
  return Math.min(1, Math.max(0, rms) * MOTION.speakAmpGain)
}

/**
 * Effective gap between ripple starts. Louder speech pulses a bit faster
 * while staying at or above speakRippleLife * speakRippleGapFloorFrac.
 */
export function effectiveRippleGap(amp: number): number {
  const a = Math.min(1, Math.max(0, amp))
  const floor = MOTION.speakRippleLife * MOTION.speakRippleGapFloorFrac
  const shortened = MOTION.speakRippleGap * (1 - a * MOTION.speakRippleAmpGapScale)
  return Math.max(floor, shortened)
}

/** Ripple opacity driver from live voice + speak floor. */
export function rippleAmpFromVoice(voiceAmp: number, speaking: boolean): number {
  const live = Math.min(1, Math.max(0, voiceAmp)) * MOTION.voiceAmpToRipple
  if (!speaking) return live
  return Math.max(MOTION.speakAmpFloor, MOTION.speakEnvelope + live * (1 - MOTION.speakEnvelope))
}

/**
 * Raymarch field ripple amplitude. Dying rings keep their held amp so the
 * shader ASR envelope can finish after speech ends — never cliff to 0 mid-life.
 */
export function raymarchRippleAmp(life: number, heldAmp: number, speaking: boolean, voiceAmp: number): number {
  if (life >= 1) return 0
  const held = Math.max(0, heldAmp)
  if (speaking) return Math.max(held, rippleAmpFromVoice(voiceAmp, true))
  return held
}

const RIPPLE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const RIPPLE_FRAG = /* glsl */ `
uniform float uLife;
uniform float uAmp;
uniform float uSpeed;
varying vec2 vUv;
void main() {
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  // Smooth expansion (ease-in-out) so the ring does not pop out linearly.
  float expand = uLife * uLife * (3.0 - 2.0 * uLife);
  float ringR = expand * 1.35 * uSpeed;
  float bandW = 0.045 + 0.035 * uAmp;
  float ring = abs(r - ringR);
  // Soft gaussian primary front instead of a hard band.
  float band = exp(-(ring * ring) / (bandW * bandW * 0.55));
  // Faint trailing front for propagation feel.
  float trailR = ringR * 0.78;
  float trailW = bandW * 1.35;
  float trail = exp(-((r - trailR) * (r - trailR)) / (trailW * trailW)) * (0.28 + 0.22 * uAmp);
  float disk = 1.0 - smoothstep(0.92, 1.38, r);
  // Soft ASR fade: quick attack, eased release.
  float attack = smoothstep(0.0, 0.12, uLife);
  float release = 1.0 - smoothstep(0.18, 1.0, uLife);
  float fade = attack * release * (0.2 + 0.55 * uAmp);
  float alpha = (band + trail) * fade * disk;
  vec3 gold = vec3(0.769, 0.643, 0.416);
  vec3 cyan = vec3(0.494, 0.722, 0.706);
  vec3 color = mix(cyan, gold, smoothstep(0.0, bandW, ring));
  gl_FragColor = vec4(color, alpha);
}
`

function goldMat(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: PALETTE.gold,
    metalness: 1,
    roughness: 0.22,
    envMapIntensity: 1.15
  })
}

function glassMat(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: PALETTE.ivory,
    metalness: 0.02,
    roughness: 0.06,
    transmission: 1,
    thickness: 1.5,
    ior: 1.5,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    transparent: true,
    opacity: 1,
    envMapIntensity: 1.2,
    attenuationColor: PALETTE.ivory,
    attenuationDistance: 2.4
  })
}

function mercuryMat(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: 0x9aa4a8,
    metalness: 1,
    roughness: 0.05,
    emissive: PALETTE.cyan,
    emissiveIntensity: 0.42,
    envMapIntensity: 1.35
  })
}

function addEdgeTubes(group: THREE.Group, size: number, radius: number, material: THREE.Material): void {
  const h = size / 2
  const axis = new THREE.Vector3(0, 1, 0)
  const dir = new THREE.Vector3()
  const mid = new THREE.Vector3()
  const edges: Array<readonly [THREE.Vector3, THREE.Vector3]> = [
    [new THREE.Vector3(-h, -h, -h), new THREE.Vector3(h, -h, -h)],
    [new THREE.Vector3(-h, h, -h), new THREE.Vector3(h, h, -h)],
    [new THREE.Vector3(-h, -h, h), new THREE.Vector3(h, -h, h)],
    [new THREE.Vector3(-h, h, h), new THREE.Vector3(h, h, h)],
    [new THREE.Vector3(-h, -h, -h), new THREE.Vector3(-h, h, -h)],
    [new THREE.Vector3(h, -h, -h), new THREE.Vector3(h, h, -h)],
    [new THREE.Vector3(-h, -h, h), new THREE.Vector3(-h, h, h)],
    [new THREE.Vector3(h, -h, h), new THREE.Vector3(h, h, h)],
    [new THREE.Vector3(-h, -h, -h), new THREE.Vector3(-h, -h, h)],
    [new THREE.Vector3(h, -h, -h), new THREE.Vector3(h, -h, h)],
    [new THREE.Vector3(-h, h, -h), new THREE.Vector3(-h, h, h)],
    [new THREE.Vector3(h, h, -h), new THREE.Vector3(h, h, h)]
  ]
  for (const [a, b] of edges) {
    dir.subVectors(b, a)
    const len = dir.length()
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 8), material)
    mid.addVectors(a, b).multiplyScalar(0.5)
    mesh.position.copy(mid)
    mesh.quaternion.setFromUnitVectors(axis, dir.normalize())
    group.add(mesh)
  }
}

function createSeal(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'seal'
  const glass = new THREE.Mesh(new RoundedBoxGeometry(SEAL_SIZE, SEAL_SIZE, SEAL_SIZE, 4, 0.045), glassMat())
  glass.name = 'glass'
  group.add(glass)

  const filigree = new THREE.Group()
  filigree.name = 'filigree'
  addEdgeTubes(filigree, SEAL_SIZE * 0.97, 0.012, goldMat())
  group.add(filigree)

  const arabesque = new THREE.Group()
  arabesque.name = 'arabesque'
  const ringMat = goldMat()
  const rings: Array<readonly [number, number, number]> = [
    [Math.PI / 2, 0, 0],
    [0, Math.PI / 2, 0],
    [0.55, 0.4, 0.9]
  ]
  for (const [rx, ry, rz] of rings) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.007, 8, 64), ringMat)
    ring.rotation.set(rx, ry, rz)
    arabesque.add(ring)
  }
  group.add(arabesque)

  const mercury = new THREE.Mesh(new THREE.SphereGeometry(0.16, 32, 24), mercuryMat())
  mercury.name = 'mercury'
  group.add(mercury)
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 24, 18),
    new THREE.MeshBasicMaterial({
      color: PALETTE.cyan,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  )
  glow.name = 'core-glow'
  group.add(glow)

  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.006, 8, 64), goldMat())
  halo.name = 'halo'
  halo.rotation.x = Math.PI / 2
  halo.position.y = -0.02
  group.add(halo)

  const coreLight = new THREE.PointLight(PALETTE.cyan, 1.2, 3, 2)
  coreLight.name = 'core-light'
  group.add(coreLight)
  return group
}

function makeRipple(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uLife: { value: 1 },
      uAmp: { value: 0 },
      uSpeed: { value: 1 }
    },
    vertexShader: RIPPLE_VERT,
    fragmentShader: RIPPLE_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), mat)
  mesh.visible = false
  mesh.name = 'ripple'
  mesh.renderOrder = 2
  return mesh
}

export class OrdisAvatar {
  readonly renderer: THREE.WebGLRenderer
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  readonly seal: THREE.Group
  private readonly clock = new THREE.Clock()
  private readonly mercury: THREE.Mesh
  private readonly glow: THREE.Mesh
  private readonly halo: THREE.Mesh
  private readonly arabesque: THREE.Group
  private readonly coreLight: THREE.PointLight
  private readonly mercuryMat: THREE.MeshPhysicalMaterial
  private readonly glowMat: THREE.MeshBasicMaterial
  private readonly ripples: THREE.Mesh[]
  private readonly rippleAge: number[]
  private readonly rippleSpeed: number[]
  private readonly mercuryVolume: THREE.Mesh
  private readonly mercuryVolumeMat: THREE.ShaderMaterial
  private readonly mercuryBalls: Array<{ pos: Vec3; vel: Vec3; rest: Vec3; radius: number }>
  private readonly localCam = new THREE.Vector3()
  private readonly gpuSyncPx = new Uint8Array(4)
  private readonly invVolume = new THREE.Matrix4()
  private status: CompanionStatus = 'idle'
  private voiceAmp = 0
  private raf = 0
  private disposed = false
  private paused = false
  private idleSkip = 0
  /** Deterministic phase salt so speed jitter is stable per ring index. */
  private rippleSalt = 0
  private renderPath: AvatarRenderPath = 'mesh'

  static resolveRenderPath(search = typeof window !== 'undefined' ? window.location.search : ''): AvatarRenderPath {
    return new URLSearchParams(search).get('mercury') === 'raymarch' ? 'raymarch' : 'mesh'
  }

  constructor(canvas: HTMLCanvasElement, options: OrdisAvatarOptions = {}) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.setSize(canvas.clientWidth || OVERLAY_FRUSTUM.width, canvas.clientHeight || 420, false)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(CAMERA_POSE.fov, OVERLAY_FRUSTUM.width / OVERLAY_FRUSTUM.height, 0.1, 20)
    this.camera.position.set(...CAMERA_POSE.position)
    this.camera.lookAt(...CAMERA_POSE.lookAt)
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environment = envTex
    pmrem.dispose()
    this.scene.add(new THREE.HemisphereLight(0xf2e6d0, 0x2a2418, 0.35))
    const key = new THREE.DirectionalLight(0xfff6e8, 0.85)
    key.position.set(-2.4, 3.4, 3.2)
    this.scene.add(key)
    this.seal = createSeal()
    this.seal.position.set(...SEAL_POSITION)
    this.scene.add(this.seal)
    this.mercury = this.seal.getObjectByName('mercury') as THREE.Mesh
    this.glow = this.seal.getObjectByName('core-glow') as THREE.Mesh
    this.halo = this.seal.getObjectByName('halo') as THREE.Mesh
    this.arabesque = this.seal.getObjectByName('arabesque') as THREE.Group
    this.coreLight = this.seal.getObjectByName('core-light') as THREE.PointLight
    this.mercuryMat = this.mercury.material as THREE.MeshPhysicalMaterial
    this.glowMat = this.glow.material as THREE.MeshBasicMaterial
    this.ripples = [makeRipple(), makeRipple(), makeRipple()]
    this.rippleAge = [1, 1, 1]
    this.rippleSpeed = [1, 1, 1]
    for (const ripple of this.ripples) this.scene.add(ripple)
    this.mercuryVolume = createMercuryVolume()
    this.mercuryVolumeMat = mercuryVolumeMaterial(this.mercuryVolume)
    this.seal.add(this.mercuryVolume)
    this.mercuryBalls = defaultMercuryBalls().map((spec) => ({
      pos: { x: spec.rest.x, y: spec.rest.y, z: spec.rest.z },
      vel: { x: 0, y: 0, z: 0 },
      rest: spec.rest,
      radius: spec.radius
    }))
    this.loop = this.loop.bind(this)
    this.setRenderPath(options.renderPath ?? OrdisAvatar.resolveRenderPath())
    this.raf = requestAnimationFrame(this.loop)
  }

  getRenderPath(): AvatarRenderPath {
    return this.renderPath
  }

  setRenderPath(path: AvatarRenderPath): void {
    this.renderPath = path === 'raymarch' ? 'raymarch' : 'mesh'
    const ray = this.renderPath === 'raymarch'
    this.mercury.visible = !ray
    this.glow.visible = !ray
    this.mercuryVolume.visible = ray
    if (ray) {
      for (const ripple of this.ripples) ripple.visible = false
    }
  }

  setStatus(status: CompanionStatus): void {
    this.status = status
  }

  setVoiceAmp(rms: number): void {
    const next = gainVoiceAmp(rms)
    if (next > this.voiceAmp) this.voiceAmp = next
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / Math.max(height, 1)
    this.camera.updateProjectionMatrix()
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.scene.environment?.dispose()
    this.renderer.dispose()
  }

  sampleGpuFrames(count: number): number[] {
    const gl = this.renderer.getContext() as WebGLRenderingContext
    this.paused = true
    const times: number[] = []
    try {
      for (let i = 0; i < count; i += 1) {
        const dt = 1 / 60
        const t = this.clock.elapsedTime + i * dt
        const t0 = performance.now()
        this.tickMotion(t, dt)
        this.renderer.render(this.scene, this.camera)
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.gpuSyncPx)
        times.push(performance.now() - t0)
      }
    } finally {
      this.paused = false
    }
    return times
  }

  private startRipple(amp: number): void {
    let idx = -1
    let oldest = -1
    for (let i = 0; i < this.rippleAge.length; i += 1) {
      const age = this.rippleAge[i] ?? 1
      if (age >= MOTION.speakRippleLife && (idx < 0 || age > oldest)) {
        idx = i
        oldest = age
      }
    }
    if (idx < 0) return
    const mesh = this.ripples[idx]
    if (!mesh) return
    this.rippleAge[idx] = 0
    this.rippleSalt += 1
    // Organic per-ring speed variance; salt keeps successive rings from matching.
    const jitter =
      Math.sin(this.rippleSalt * 12.9898 + idx * 78.233) * MOTION.speakRippleSpeedJitter
    const speed = 1 + jitter
    this.rippleSpeed[idx] = speed
    mesh.visible = this.renderPath !== 'raymarch'
    mesh.position.copy(this.seal.position)
    const mat = mesh.material as THREE.ShaderMaterial
    mat.uniforms.uLife!.value = 0
    mat.uniforms.uAmp!.value = amp
    mat.uniforms.uSpeed!.value = speed
  }

  private loop(): void {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.loop)
    if (this.paused) return
    const dt = this.clock.getDelta()
    const t = this.clock.elapsedTime
    // Idle / low-power: skip every other paint. Motion stays time-based via the clock
    // so resumed frames stay continuous (not frame-counted).
    if (this.status === 'idle') {
      this.idleSkip += 1
      if (this.idleSkip % 2 === 1) {
        this.tickMotion(t, dt)
        return
      }
    } else {
      this.idleSkip = 0
    }
    this.tickMotion(t, dt)
    this.renderer.render(this.scene, this.camera)
  }

  private tickMotion(t: number, dt: number): void {
    const breath = idleBreathOffset(t)
    const { yaw, pitch } = idlePrecession(t)
    this.seal.position.set(SEAL_POSITION[0], SEAL_POSITION[1] + breath, SEAL_POSITION[2])
    this.seal.rotation.set(pitch, yaw, 0)

    let amp = this.voiceAmp
    this.voiceAmp = decayVoiceAmp(this.voiceAmp, dt)
    if (this.status === 'speaking') {
      // Soft speech-shaped floor when TTS amp has not arrived yet, plus a slow organic wobble.
      const wobble =
        MOTION.speakFloorWobbleA * Math.sin(t * MOTION.speakFloorWobbleHzA) +
        MOTION.speakFloorWobbleB * Math.sin(t * MOTION.speakFloorWobbleHzB + 0.7)
      amp = Math.max(amp, MOTION.speakEnvelope + wobble)
    }
    const pulse = softCorePulse(t, this.status === 'speaking' ? amp : 0)
    const idleMul = this.status === 'idle' ? MOTION.idleIntensity : 1
    this.mercuryMat.emissiveIntensity = 0.42 * pulse * idleMul * (this.status === 'thinking' ? 0.8 : 1)
    this.glowMat.opacity = 0.32 * pulse * idleMul
    this.coreLight.intensity = 1.2 * pulse * idleMul
    const caustic =
      1 +
      MOTION.idleMicroCaustic *
        idleMul *
        Math.sin(t * MOTION.idleMicroCausticHzA) *
        Math.sin(t * MOTION.idleMicroCausticHzB + 0.4)
    this.mercury.scale.setScalar(caustic)
    this.glow.scale.setScalar(0.92 + 0.08 * pulse)

    // TODO(voice-in): on-device STT can drive status==='listening' later. Keep dormant —
    // do not wire mic / Web Speech here; halo tween stays ready for that day.
    const haloTarget = this.status === 'listening' ? MOTION.listenHaloScale : 1
    const haloNow =
      this.halo.scale.x + (haloTarget - this.halo.scale.x) * Math.min(1, dt * MOTION.haloLerpPerSec)
    this.halo.scale.setScalar(haloNow)

    if (this.status === 'thinking') {
      this.arabesque.rotation.y += MOTION.thinkSpinRadPerSec * dt
    }

    if (this.status === 'speaking') {
      const youngest = Math.min(...this.rippleAge)
      const gap = effectiveRippleGap(amp)
      if (youngest >= gap) this.startRipple(rippleAmpFromVoice(amp, true))
    }
    for (let i = 0; i < this.ripples.length; i += 1) {
      const mesh = this.ripples[i]
      if (!mesh) continue
      const age = (this.rippleAge[i] ?? 1) + dt
      this.rippleAge[i] = age
      const life = Math.min(1, age / MOTION.speakRippleLife)
      const mat = mesh.material as THREE.ShaderMaterial
      mat.uniforms.uLife!.value = life
      // Keep amp coupled while the ring lives so late TTS peaks still brighten it.
      if (mesh.visible && this.status === 'speaking') {
        const live = rippleAmpFromVoice(amp, true)
        const held = mat.uniforms.uAmp!.value as number
        mat.uniforms.uAmp!.value = Math.max(held, live)
      }
      if (this.renderPath === 'raymarch') {
        mesh.visible = false
      } else {
        mesh.quaternion.copy(this.camera.quaternion)
        mesh.position.copy(this.seal.position)
        if (life >= 1) mesh.visible = false
      }
    }
    this.syncMercuryVolume(t, dt, pulse, idleMul, amp)
  }

  private syncMercuryVolume(t: number, dt: number, pulse: number, idleMul: number, amp: number): void {
    const speakBoost = this.status === 'speaking' ? 1.7 : 1
    const params = {
      viscosity: MOTION.mercuryViscosity,
      restore: MOTION.mercuryRestore,
      noiseSpeed: MOTION.mercuryNoiseSpeed * idleMul * speakBoost,
      bounds: MOTION.mercuryBounds
    }
    const uniforms = this.mercuryVolumeMat.uniforms
    const balls = uniforms.uBalls!.value as THREE.Vector3[]
    const radii = uniforms.uRadii!.value as number[]
    for (let i = 0; i < this.mercuryBalls.length; i += 1) {
      const ball = this.mercuryBalls[i]
      if (!ball) continue
      integrateMercuryBall(ball.pos, ball.vel, ball.rest, t, dt, params)
      balls[i]?.set(ball.pos.x, ball.pos.y, ball.pos.z)
      radii[i] = ball.radius * (this.status === 'speaking' ? 1 + amp * 0.04 : 1)
    }
    const ripples = uniforms.uRipples!.value as THREE.Vector4[]
    for (let i = 0; i < 3; i += 1) {
      const age = this.rippleAge[i] ?? 1
      const life = Math.min(1, age / MOTION.speakRippleLife)
      const speed = this.rippleSpeed[i] ?? 1
      const held = ripples[i]?.y ?? 0
      const rAmp = raymarchRippleAmp(life, held, this.status === 'speaking', amp)
      ripples[i]?.set(life, rAmp, speed, 0)
    }
    this.mercuryVolume.updateWorldMatrix(true, false)
    this.invVolume.copy(this.mercuryVolume.matrixWorld).invert()
    this.localCam.copy(this.camera.position).applyMatrix4(this.invVolume)
    ;(uniforms.uLocalCam!.value as THREE.Vector3).copy(this.localCam)
    uniforms.uTime!.value = t
    uniforms.uPulse!.value = pulse
    uniforms.uIdleMul!.value = idleMul
    uniforms.uThreshold!.value = MOTION.mercuryThreshold
    uniforms.uNoiseAmt!.value = MOTION.idleMicroCaustic * idleMul * (this.status === 'speaking' ? 1.35 : 0.85)
    uniforms.uRippleDisplace!.value = MOTION.mercuryRippleDisplace
    uniforms.uSteps!.value = this.status === 'idle' ? MOTION.mercuryIdleSteps : MOTION.mercurySteps
  }
}
