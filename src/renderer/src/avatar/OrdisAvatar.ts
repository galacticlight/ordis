import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { CompanionStatus } from '../../../shared/types'

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
  idlePrecessionRad: (2 * Math.PI) / 180,
  idlePrecessionPeriod: 20,
  corePulseHz: 0.15,
  corePulseAmt: 0.08,
  listenHaloScale: 1.04,
  thinkSpinRadPerSec: (4 * Math.PI) / 180,
  speakRippleLife: 0.9,
  speakRippleGap: 0.48,
  speakEnvelope: 0.38,
  idleIntensity: 0.85
} as const

export const OVERLAY_FRUSTUM = { width: 420, height: 640 } as const
export const SEAL_SIZE = 1
export const SEAL_POSITION = [0, 0.06, 0] as const
export const CAMERA_POSE = {
  fov: 30,
  position: [1.48, 0.92, 3.95] as const,
  lookAt: [0, 0.06, 0] as const
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
varying vec2 vUv;
void main() {
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  float ringR = uLife * 1.35;
  float ring = abs(r - ringR);
  float band = 1.0 - smoothstep(0.0, 0.055, ring);
  float fade = (1.0 - uLife) * 0.35 * uAmp;
  float alpha = band * fade;
  vec3 gold = vec3(0.769, 0.643, 0.416);
  vec3 cyan = vec3(0.494, 0.722, 0.706);
  vec3 color = mix(cyan, gold, smoothstep(0.0, 0.04, ring));
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
      uAmp: { value: 0 }
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
  private status: CompanionStatus = 'idle'
  private voiceAmp = 0
  private raf = 0
  private disposed = false
  private idleSkip = 0

  constructor(canvas: HTMLCanvasElement) {
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
    for (const ripple of this.ripples) this.scene.add(ripple)
    this.loop = this.loop.bind(this)
    this.raf = requestAnimationFrame(this.loop)
  }

  setStatus(status: CompanionStatus): void {
    this.status = status
  }

  setVoiceAmp(rms: number): void {
    const next = Math.min(1, Math.max(0, rms) * 5)
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
    mesh.visible = true
    mesh.position.copy(this.seal.position)
    const mat = mesh.material as THREE.ShaderMaterial
    mat.uniforms.uLife!.value = 0
    mat.uniforms.uAmp!.value = amp
  }

  private loop(): void {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.loop)
    const dt = this.clock.getDelta()
    const t = this.clock.elapsedTime
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
    const breath = Math.sin((t * Math.PI * 2) / MOTION.idleBreathPeriod) * MOTION.idleBreathWorld
    const yaw = Math.sin((t * Math.PI * 2) / MOTION.idlePrecessionPeriod) * MOTION.idlePrecessionRad
    const pitch = Math.cos((t * Math.PI * 2) / (MOTION.idlePrecessionPeriod * 1.15)) * MOTION.idlePrecessionRad * 0.4
    this.seal.position.set(SEAL_POSITION[0], SEAL_POSITION[1] + breath, SEAL_POSITION[2])
    this.seal.rotation.set(pitch, yaw, 0)

    const pulse = 1 + Math.sin(t * MOTION.corePulseHz * Math.PI * 2) * MOTION.corePulseAmt
    const idleMul = this.status === 'idle' ? MOTION.idleIntensity : 1
    let amp = this.voiceAmp
    this.voiceAmp *= Math.exp(-dt * 3.2)
    if (this.status === 'speaking') {
      amp = Math.max(amp, MOTION.speakEnvelope + 0.14 * Math.sin(t * 5.5))
    }
    this.mercuryMat.emissiveIntensity = 0.42 * pulse * idleMul * (this.status === 'thinking' ? 0.8 : 1)
    this.glowMat.opacity = 0.32 * pulse * idleMul
    this.coreLight.intensity = 1.2 * pulse * idleMul
    const caustic = 1 + 0.04 * Math.sin(t * 0.7) * Math.sin(t * 1.13 + 0.4)
    this.mercury.scale.setScalar(caustic)
    this.glow.scale.setScalar(0.92 + 0.08 * pulse)

    const haloTarget = this.status === 'listening' ? MOTION.listenHaloScale : 1
    const haloNow = this.halo.scale.x + (haloTarget - this.halo.scale.x) * Math.min(1, dt * 4)
    this.halo.scale.setScalar(haloNow)

    if (this.status === 'thinking') {
      this.arabesque.rotation.y += MOTION.thinkSpinRadPerSec * dt
    }

    if (this.status === 'speaking') {
      const youngest = Math.min(...this.rippleAge)
      if (youngest >= MOTION.speakRippleGap) this.startRipple(Math.max(0.45, amp))
    }
    for (let i = 0; i < this.ripples.length; i += 1) {
      const mesh = this.ripples[i]
      if (!mesh) continue
      const age = (this.rippleAge[i] ?? 1) + dt
      this.rippleAge[i] = age
      const life = Math.min(1, age / MOTION.speakRippleLife)
      const mat = mesh.material as THREE.ShaderMaterial
      mat.uniforms.uLife!.value = life
      mesh.quaternion.copy(this.camera.quaternion)
      mesh.position.copy(this.seal.position)
      if (life >= 1) mesh.visible = false
    }
  }
}
