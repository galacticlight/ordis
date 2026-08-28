import * as THREE from 'three'
import type { CompanionStatus } from '../../../shared/types'

const CREAM = 0xe8dcc4
const GOLD = 0xd4af37
const CYAN = 0x3ee8f0
const INK = 0x12141c

/** Cube glyph world position. Kept inside the 420x640 overlay frustum; no bob. */
export const CUBE_GLYPH_POSITION = [0.3, -0.4, 0.48] as const
export const OVERLAY_FRUSTUM = { width: 420, height: 640 } as const

function creamMat(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: CREAM, metalness: 0.28, roughness: 0.42 })
}
function goldMat(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.86, roughness: 0.28 })
}
function cyanMat(intensity = 1.4): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: CYAN,
    emissive: CYAN,
    emissiveIntensity: intensity,
    metalness: 0.2,
    roughness: 0.3
  })
}

function createSentinel(): THREE.Group {
  const group = new THREE.Group()
  const profile = [
    new THREE.Vector2(0.02, 1.18),
    new THREE.Vector2(0.14, 1.14),
    new THREE.Vector2(0.3, 1.02),
    new THREE.Vector2(0.48, 0.82),
    new THREE.Vector2(0.55, 0.58),
    new THREE.Vector2(0.5, 0.38),
    new THREE.Vector2(0.34, 0.22),
    new THREE.Vector2(0.16, 0.1),
    new THREE.Vector2(0.14, 0.0),
    new THREE.Vector2(0.34, -0.16),
    new THREE.Vector2(0.5, -0.4),
    new THREE.Vector2(0.54, -0.66),
    new THREE.Vector2(0.42, -0.88),
    new THREE.Vector2(0.2, -0.98),
    new THREE.Vector2(0.02, -1.02)
  ]
  group.add(new THREE.Mesh(new THREE.LatheGeometry(profile, 48), creamMat()))
  const opening = new THREE.Mesh(
    new THREE.SphereGeometry(0.38, 24, 18),
    new THREE.MeshStandardMaterial({ color: INK, metalness: 0.15, roughness: 0.65 })
  )
  opening.scale.set(0.7, 1.05, 0.55)
  opening.position.set(0.02, -0.48, 0.28)
  group.add(opening)
  const skirt = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.018, 8, 48), goldMat())
  skirt.rotation.x = Math.PI / 2
  skirt.position.y = -0.62
  skirt.scale.set(1, 0.72, 1)
  group.add(skirt)
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.014, 8, 32), goldMat())
  halo.position.y = 1.16
  halo.rotation.x = Math.PI / 2.4
  group.add(halo)
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 16, 0, Math.PI * 2, 0, Math.PI / 2), creamMat())
  cap.position.y = 1.12
  group.add(cap)
  for (const sign of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.022, 10, 32, Math.PI * 1.15), cyanMat(1.8))
    eye.position.set(sign * 0.15, 0.58, 0.42)
    eye.rotation.z = sign > 0 ? -0.35 : 0.35 + Math.PI
    eye.name = sign > 0 ? 'eye-r' : 'eye-l'
    group.add(eye)
  }
  const scroll = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 8, 24, Math.PI), goldMat())
  scroll.position.set(0, 0.42, 0.4)
  scroll.rotation.x = 0.4
  scroll.rotation.z = Math.PI
  group.add(scroll)
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.12), creamMat())
  core.position.set(0, -0.42, 0.12)
  group.add(core)
  const coreLight = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.04), cyanMat(1.6))
  coreLight.position.set(0, -0.42, 0.19)
  group.add(coreLight)
  return group
}

function createCubeGlyph(): THREE.Group {
  const group = new THREE.Group()
  const glass = new THREE.MeshStandardMaterial({
    color: CREAM,
    metalness: 0.15,
    roughness: 0.35,
    transparent: true,
    opacity: 0.28,
    emissive: CYAN,
    emissiveIntensity: 0.08
  })
  group.add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), glass))
  group.add(
    new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(0.42, 0.42, 0.42)),
      new THREE.LineBasicMaterial({ color: GOLD })
    )
  )
  const eye = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.018, 12, 48), cyanMat(1.2))
  eye.position.z = 0.22
  group.add(eye)
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 16), cyanMat(2.2))
  pupil.position.z = 0.22
  group.add(pupil)
  return group
}

export class OrdisAvatar {
  readonly renderer: THREE.WebGLRenderer
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  readonly sentinel: THREE.Group
  readonly glyph: THREE.Group
  private readonly clock = new THREE.Clock()
  private readonly eyes: THREE.Mesh[] = []
  private readonly ripples: { mesh: THREE.Mesh; age: number }[] = []
  private status: CompanionStatus = 'idle'
  private raf = 0
  private disposed = false

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.setSize(canvas.clientWidth || 360, canvas.clientHeight || 420, false)
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(32, 360 / 420, 0.1, 20)
    this.camera.position.set(0, 0.12, 4.35)
    this.camera.lookAt(0, 0.05, 0)
    this.scene.add(new THREE.HemisphereLight(0xb8e4ea, 0x3a3020, 0.85))
    const key = new THREE.DirectionalLight(0xfff2d4, 1.15)
    key.position.set(-2.2, 3.2, 4)
    this.scene.add(key)
    const fill = new THREE.PointLight(CYAN, 0.55, 8)
    fill.position.set(0.4, 0.6, 1.6)
    this.scene.add(fill)
    this.sentinel = createSentinel()
    this.sentinel.position.y = 0.22
    this.scene.add(this.sentinel)
    this.sentinel.traverse((obj) => {
      if (obj.name.startsWith('eye-') && obj instanceof THREE.Mesh) this.eyes.push(obj)
    })
    this.glyph = createCubeGlyph()
    this.glyph.position.set(...CUBE_GLYPH_POSITION)
    this.scene.add(this.glyph)
    this.loop = this.loop.bind(this)
    this.raf = requestAnimationFrame(this.loop)
  }

  setStatus(status: CompanionStatus): void {
    this.status = status
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / Math.max(height, 1)
    this.camera.updateProjectionMatrix()
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.renderer.dispose()
  }

  private spawnRipple(): void {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.18, 0.2, 48),
      new THREE.MeshBasicMaterial({
        color: CYAN,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    )
    mesh.position.copy(this.glyph.position)
    this.scene.add(mesh)
    this.ripples.push({ mesh, age: 0 })
  }

  private loop(): void {
    if (this.disposed) return
    const dt = this.clock.getDelta()
    const t = this.clock.elapsedTime
    this.raf = requestAnimationFrame(this.loop)
    this.sentinel.position.y = 0.22 + Math.sin(t * 1.1) * 0.04
    this.sentinel.rotation.y = Math.sin(t * 0.35) * 0.12
    this.glyph.rotation.y = t * 0.4
    const speaking = this.status === 'speaking'
    const pulse = speaking ? 0.55 + Math.sin(t * 8) * 0.45 : 0.25
    for (const eye of this.eyes) {
      const eyeMat = eye.material as THREE.MeshStandardMaterial
      eyeMat.emissiveIntensity = 1.2 + pulse * 1.4
    }
    if (speaking && Math.random() < 0.08) this.spawnRipple()
    for (let i = this.ripples.length - 1; i >= 0; i -= 1) {
      const ripple = this.ripples[i]
      if (!ripple) continue
      ripple.age += dt
      ripple.mesh.scale.setScalar(1 + ripple.age * 2.4)
      const mat = ripple.mesh.material as THREE.MeshBasicMaterial
      mat.opacity = Math.max(0, 0.65 - ripple.age * 0.9)
      if (ripple.age > 0.8) {
        this.scene.remove(ripple.mesh)
        ripple.mesh.geometry.dispose()
        mat.dispose()
        this.ripples.splice(i, 1)
      }
    }
    this.renderer.render(this.scene, this.camera)
  }
}
