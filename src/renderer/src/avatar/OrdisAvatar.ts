import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  PerspectiveCamera,
  RingGeometry,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderer
} from 'three'

export type AvatarStatus = 'idle' | 'listening' | 'thinking' | 'speaking'

const vertex = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNormal;
  void main() {
    vPos = position;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragment = /* glsl */ `
  uniform float uTime;
  uniform float uSpeak;
  uniform float uGlitch;
  uniform vec3 uGold;
  uniform vec3 uCyan;
  varying vec3 vPos;
  varying vec3 vNormal;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float cracks(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    float m = 1.0;
    for (int x = -1; x <= 1; x++) {
      for (int y = -1; y <= 1; y++) {
        for (int z = -1; z <= 1; z++) {
          vec3 g = vec3(float(x), float(y), float(z));
          vec3 o = vec3(hash(i + g), hash(i + g + 1.7), hash(i + g + 3.1));
          vec3 r = g + o - f;
          m = min(m, length(r));
        }
      }
    }
    float edge = 1.0 - smoothstep(0.04, 0.11, m);
    return edge;
  }

  void main() {
    vec3 n = normalize(vNormal);
    float fresnel = pow(1.0 - abs(n.z), 2.2);
    float crack = cracks(vPos * 3.4 + vec3(0.0, 0.0, uGlitch * 0.4));
    vec3 glass = mix(vec3(0.05, 0.07, 0.1), uCyan * 0.35, 0.45 + 0.25 * uSpeak);
    vec3 col = glass;
    col += uGold * fresnel * 0.85;
    col += uCyan * crack * (0.35 + 0.55 * uSpeak);
    col += uGold * crack * 0.15;
    float pulse = 0.55 + 0.45 * sin(uTime * 2.2);
    col += uCyan * 0.08 * pulse;
    float alpha = 0.38 + fresnel * 0.5 + crack * 0.25 + uSpeak * 0.12;
    gl_FragColor = vec4(col, clamp(alpha, 0.28, 0.92));
  }
`

const ringVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const ringFragment = /* glsl */ `
  uniform float uTime;
  uniform float uSpeak;
  uniform float uPhase;
  uniform vec3 uCyan;
  uniform vec3 uGold;
  varying vec2 vUv;
  void main() {
    float r = vUv.y;
    float wave = sin((vUv.x * 40.0) + uTime * 8.0 + uPhase);
    float band = smoothstep(0.15, 0.0, abs(wave) * (0.35 + r));
    float fade = (0.15 + 0.85 * uSpeak) * (1.0 - r);
    vec3 col = mix(uCyan, uGold, 0.35 + 0.25 * wave);
    gl_FragColor = vec4(col, band * fade * 0.55);
  }
`

export class OrdisAvatar {
  private readonly renderer: WebGLRenderer
  private readonly scene = new Scene()
  private readonly camera: PerspectiveCamera
  private readonly root = new Group()
  private readonly cubeMat: ShaderMaterial
  private readonly rings: ShaderMaterial[] = []
  private frame = 0
  private speaking = 0
  private targetSpeak = 0
  private glitch = 0
  private status: AvatarStatus = 'idle'
  private running = false
  private hidden = false
  private raf = 0
  private last = 0
  private readonly onVis: () => void

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'low-power'
    })
    this.renderer.setClearColor(0x000000, 0)
    this.camera = new PerspectiveCamera(32, 1, 0.1, 20)
    this.camera.position.set(0, 0.15, 5.2)

    this.cubeMat = new ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uSpeak: { value: 0 },
        uGlitch: { value: 0 },
        uGold: { value: new Color('#d4b45a') },
        uCyan: { value: new Color('#8fd4e8') }
      }
    })

    const geom = new BoxGeometry(1.55, 1.55, 1.55, 12, 12, 12)
    const cube = new Mesh(geom, this.cubeMat)
    this.root.add(cube)

    const edges = new LineSegments(
      new EdgesGeometry(new BoxGeometry(1.56, 1.56, 1.56)),
      new LineBasicMaterial({
        color: 0xd4b45a,
        transparent: true,
        opacity: 0.55
      })
    )
    this.root.add(edges)

    for (let i = 0; i < 3; i += 1) {
      const mat = new ShaderMaterial({
        vertexShader: ringVertex,
        fragmentShader: ringFragment,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uSpeak: { value: 0 },
          uPhase: { value: i * 1.7 },
          uCyan: { value: new Color('#8fd4e8') },
          uGold: { value: new Color('#e8d48b') }
        }
      })
      const ring = new Mesh(new RingGeometry(1.1, 1.7 + i * 0.35, 96), mat)
      ring.lookAt(0, 0, 5.2)
      this.root.add(ring)
      this.rings.push(mat)
    }

    this.scene.add(this.root)
    this.resize()
    this.onVis = () => {
      this.hidden = document.hidden
    }
    document.addEventListener('visibilitychange', this.onVis)
    window.addEventListener('resize', this.resize)
  }

  setStatus(status: AvatarStatus): void {
    this.status = status
    this.targetSpeak = status === 'speaking' ? 1 : status === 'thinking' ? 0.35 : 0.08
  }

  pulseGlitch(): void {
    this.glitch = 1
  }

  start(): void {
    if (this.running) {
      return
    }
    this.running = true
    this.last = performance.now()
    const loop = (now: number): void => {
      this.raf = requestAnimationFrame(loop)
      if (!this.running) {
        return
      }
      const dt = Math.min(0.05, (now - this.last) / 1000)
      this.last = now
      this.tick(dt, now / 1000)
    }
    this.raf = requestAnimationFrame(loop)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.raf)
  }

  dispose(): void {
    this.stop()
    document.removeEventListener('visibilitychange', this.onVis)
    window.removeEventListener('resize', this.resize)
    this.renderer.dispose()
  }

  private readonly resize = (): void => {
    const parent = this.canvas.parentElement
    const w = parent?.clientWidth ?? 320
    const h = parent?.clientHeight ?? 220
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.renderer.setPixelRatio(dpr)
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / Math.max(h, 1)
    this.camera.updateProjectionMatrix()
  }

  private tick(dt: number, time: number): void {
    this.frame += 1
    const idle = this.status === 'idle' || this.hidden
    if (idle && this.frame % 2 === 1) {
      return
    }

    this.speaking += (this.targetSpeak - this.speaking) * Math.min(1, dt * 6)
    this.glitch *= Math.max(0, 1 - dt * 2.4)

    this.cubeMat.uniforms.uTime.value = time
    this.cubeMat.uniforms.uSpeak.value = this.speaking
    this.cubeMat.uniforms.uGlitch.value = this.glitch
    for (const ring of this.rings) {
      ring.uniforms.uTime.value = time
      ring.uniforms.uSpeak.value = this.speaking
    }

    const spin = idle ? 0.12 : 0.22 + this.speaking * 0.35
    this.root.rotation.y += dt * spin
    this.root.rotation.x = Math.sin(time * 0.6) * 0.12
    this.root.position.y = Math.sin(time * 0.9) * 0.08
    this.camera.lookAt(new Vector3(0, this.root.position.y, 0))
    this.renderer.render(this.scene, this.camera)
  }
}
