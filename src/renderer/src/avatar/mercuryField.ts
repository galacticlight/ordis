/**
 * CPU-side mercury field helpers shared with the raymarch spike.
 * The GLSL in mercuryRaymarch.ts mirrors these kernels; keep them in step.
 * This module must not import OrdisAvatar (the avatar imports us).
 */

export type Vec3 = { x: number; y: number; z: number }

export const MERCURY_BALL_COUNT = 5
export const MERCURY_FIELD_THRESHOLD_DEFAULT = 0.42
export const MERCURY_RIPPLE_DISPLACE_DEFAULT = 0.055
export const MERCURY_SMOOTH_K_DEFAULT = 0.06

/** Wyvill metaball kernel: (1-(r/R)^2)^3 inside the support, else 0. */
export function metaballKernel(r: number, radius: number): number {
  if (radius <= 0) return 0
  const t = r / radius
  if (t >= 1) return 0
  const u = 1 - t * t
  return u * u * u
}

export function sampleMetaballField(
  px: number,
  py: number,
  pz: number,
  balls: readonly { x: number; y: number; z: number; radius: number }[]
): number {
  let sum = 0
  for (const ball of balls) {
    const dx = px - ball.x
    const dy = py - ball.y
    const dz = pz - ball.z
    sum += metaballKernel(Math.hypot(dx, dy, dz), ball.radius)
  }
  return sum
}

/** Approximate implicit SDF: positive outside the blob. */
export function fieldToSdf(field: number, threshold = MERCURY_FIELD_THRESHOLD_DEFAULT): number {
  return threshold - field
}

/** IQ quadratic smooth-min; conservative for valid input SDFs (fattens the blend). */
export function smoothMinQuadratic(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b)
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * 0.25
}

export function sphereSdf(
  px: number,
  py: number,
  pz: number,
  cx: number,
  cy: number,
  cz: number,
  radius: number
): number {
  return Math.hypot(px - cx, py - cy, pz - cz) - radius
}

export function sampleSmoothUnionSpheres(
  px: number,
  py: number,
  pz: number,
  balls: readonly { x: number; y: number; z: number; radius: number }[],
  k = MERCURY_SMOOTH_K_DEFAULT
): number {
  if (balls.length === 0) return Number.POSITIVE_INFINITY
  const first = balls[0]
  if (!first) return Number.POSITIVE_INFINITY
  let d = sphereSdf(px, py, pz, first.x, first.y, first.z, first.radius)
  for (let i = 1; i < balls.length; i += 1) {
    const ball = balls[i]
    if (!ball) continue
    d = smoothMinQuadratic(d, sphereSdf(px, py, pz, ball.x, ball.y, ball.z, ball.radius), k)
  }
  return d
}

/** Deterministic hash on [0, 1). */
export function hash01(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123
  return s - Math.floor(s)
}

function smoothstep01(x: number): number {
  const t = Math.min(1, Math.max(0, x))
  return t * t * (3 - 2 * t)
}

/** Same ASR as rippleFadeEnvelope in OrdisAvatar — kept local to avoid a cycle. */
function rippleFade(life01: number): number {
  const life = Math.min(1, Math.max(0, life01))
  const attack = smoothstep01(life / 0.12)
  const release = 1 - smoothstep01((life - 0.18) / 0.82)
  return attack * Math.max(0, release)
}

/**
 * Cheap discrete curl of a hashed scalar triple. Divergence-free swirl
 * so the mercury drifts rather than breathing in and out.
 */
export function curlNoise(x: number, y: number, z: number, t: number): Vec3 {
  const e = 0.18
  const n = (ax: number, ay: number, az: number): number => hash01(ax + t * 0.11, ay - t * 0.07, az + t * 0.05)
  const dnyDz = (n(x, y, z + e) - n(x, y, z - e)) / (2 * e)
  const dnzDy = (n(x + 17, y + e, z) - n(x + 17, y - e, z)) / (2 * e)
  const dnzDx = (n(x + e + 17, y, z) - n(x - e + 17, y, z)) / (2 * e)
  const dnxDz = (n(x, y + 31, z + e) - n(x, y + 31, z - e)) / (2 * e)
  const dnxDy = (n(x, y + e, z + 13) - n(x, y - e, z + 13)) / (2 * e)
  const dnyDx = (n(x + e, y, z + 13) - n(x - e, y, z + 13)) / (2 * e)
  return { x: dnzDy - dnyDz, y: dnxDz - dnzDx, z: dnyDx - dnxDy }
}

export type MercuryIntegrateParams = {
  viscosity: number
  restore: number
  noiseSpeed: number
  bounds: number
}

/**
 * Overdamped integrate: spring toward rest + curl advection, then viscous decay.
 * High viscosity / modest restore stays sluggish instead of springy.
 */
export function integrateMercuryBall(
  pos: Vec3,
  vel: Vec3,
  rest: Vec3,
  t: number,
  dt: number,
  params: MercuryIntegrateParams
): void {
  const n = curlNoise(pos.x * 4.2, pos.y * 4.2, pos.z * 4.2, t)
  const step = Math.max(0, dt)
  vel.x += ((rest.x - pos.x) * params.restore + n.x * params.noiseSpeed) * step
  vel.y += ((rest.y - pos.y) * params.restore + n.y * params.noiseSpeed) * step
  vel.z += ((rest.z - pos.z) * params.restore + n.z * params.noiseSpeed) * step
  const decay = Math.exp(-Math.max(0, params.viscosity) * step)
  vel.x *= decay
  vel.y *= decay
  vel.z *= decay
  pos.x += vel.x * step
  pos.y += vel.y * step
  pos.z += vel.z * step
  const len = Math.hypot(pos.x, pos.y, pos.z)
  if (len > params.bounds && len > 1e-8) {
    const s = params.bounds / len
    pos.x *= s
    pos.y *= s
    pos.z *= s
  }
}

/**
 * Normal-displaced speech ripple at radial distance `radius` from the blob origin.
 * Expansion and ASR fade match the overlay ring language in OrdisAvatar.
 */
export function rippleNormalDisplacement(
  radius: number,
  life01: number,
  amp: number,
  speed: number,
  displace = MERCURY_RIPPLE_DISPLACE_DEFAULT
): number {
  const life = Math.min(1, Math.max(0, life01))
  const a = Math.min(1, Math.max(0, amp))
  const expand = life * life * (3 - 2 * life)
  const ringR = expand * 0.42 * Math.max(0.01, speed)
  const bandW = 0.035 + 0.028 * a
  const ring = Math.abs(radius - ringR)
  const band = Math.exp(-(ring * ring) / (bandW * bandW * 0.55))
  return band * rippleFade(life) * a * displace
}

export function defaultMercuryBalls(): Array<{ rest: Vec3; radius: number }> {
  const s = 0.048
  return [
    { rest: { x: 0, y: 0, z: 0 }, radius: 0.155 },
    { rest: { x: s, y: s, z: s }, radius: 0.095 },
    { rest: { x: s, y: -s, z: -s }, radius: 0.095 },
    { rest: { x: -s, y: s, z: -s }, radius: 0.095 },
    { rest: { x: -s, y: -s, z: s }, radius: 0.095 }
  ]
}
