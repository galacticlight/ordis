/**
 * Raymarched implicit mercury volume. Spike path only; default avatar stays mesh.
 */
import * as THREE from 'three'
import { MERCURY_FIELD_THRESHOLD_DEFAULT, MERCURY_RIPPLE_DISPLACE_DEFAULT, MERCURY_SMOOTH_K_DEFAULT } from './mercuryField'

export const MERCURY_VOLUME_SIZE = 0.88
export const MERCURY_MAX_STEPS = 72

const VERT = /* glsl */ `
varying vec3 vLocalPos;
void main() {
  vLocalPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAG = /* glsl */ `
uniform vec3 uLocalCam;
uniform vec3 uBalls[5];
uniform float uRadii[5];
uniform vec4 uRipples[3];
uniform float uTime;
uniform float uPulse;
uniform float uIdleMul;
uniform float uThreshold;
uniform float uNoiseAmt;
uniform float uRippleDisplace;
uniform float uSmoothK;
uniform int uSteps;
varying vec3 vLocalPos;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.23));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float valueNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash(i);
  float n100 = hash(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash(i + vec3(1.0, 1.0, 1.0));
  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  return mix(mix(nx00, nx10, f.y), mix(nx01, nx11, f.y), f.z);
}

float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / max(k, 1e-5);
  return min(a, b) - h * h * k * 0.25;
}

float rippleDisp(float rad, float life, float amp, float speed) {
  float expand = life * life * (3.0 - 2.0 * life);
  float ringR = expand * 0.42 * max(0.01, speed);
  float bandW = 0.035 + 0.028 * amp;
  float ring = abs(rad - ringR);
  float band = exp(-(ring * ring) / (bandW * bandW * 0.55));
  float attack = smoothstep(0.0, 0.12, life);
  float release = 1.0 - smoothstep(0.18, 1.0, life);
  return band * attack * release * amp * uRippleDisplace;
}

// Conservative distance: smooth-union of sphere SDFs only. No density residual, no noise.
float fieldSdf(vec3 p) {
  float d = length(p - uBalls[0]) - uRadii[0];
  for (int i = 1; i < 5; i++) {
    d = smin(d, length(p - uBalls[i]) - uRadii[i], uSmoothK);
  }
  return d;
}

float speechRipple(vec3 p) {
  float rad = length(p);
  float ripple = 0.0;
  for (int i = 0; i < 3; i++) {
    float life = uRipples[i].x;
    float amp = uRipples[i].y;
    float speed = uRipples[i].z;
    if (life < 0.999 && amp > 0.001) {
      ripple += rippleDisp(rad, life, amp, speed);
    }
  }
  return ripple;
}

vec3 fieldNormal(vec3 p) {
  const float e = 0.0024;
  vec2 k = vec2(1.0, -1.0);
  return normalize(
    k.xyy * fieldSdf(p + k.xyy * e) +
    k.yyx * fieldSdf(p + k.yyx * e) +
    k.yxy * fieldSdf(p + k.yxy * e) +
    k.xxx * fieldSdf(p + k.xxx * e)
  );
}

bool march(vec3 ro, vec3 rd, out vec3 hitP, out float tHit) {
  float start = length(vLocalPos - ro);
  float t = max(0.0, start - 0.002);
  float maxT = t + 1.6;
  for (int i = 0; i < 72; i++) {
    if (i >= uSteps) break;
    vec3 p = ro + rd * t;
    float d = fieldSdf(p);
    if (d < 0.0015) {
      hitP = p;
      tHit = t;
      return true;
    }
    t += max(d, 0.0015);
    if (t > maxT) break;
  }
  return false;
}

void main() {
  vec3 ro = uLocalCam;
  vec3 rd = normalize(vLocalPos - ro);
  vec3 p;
  float tHit;
  if (!march(ro, rd, p, tHit)) discard;

  vec3 N = fieldNormal(p);
  float ripple = speechRipple(p);
  float n = valueNoise(p * 3.4 + vec3(uTime * 0.17, uTime * 0.11, -uTime * 0.09));
  vec3 radial = length(p) > 1e-4 ? normalize(p) : N;
  N = normalize(N + radial * ripple * 10.0 + vec3(n - 0.5) * uNoiseAmt * 0.35);
  vec3 V = normalize(-rd);
  vec3 L = normalize(vec3(-0.42, 0.72, 0.58));
  vec3 H = normalize(V + L);
  float ndl = clamp(dot(N, L) * 0.55 + 0.45, 0.0, 1.0);
  float spec = pow(clamp(dot(N, H), 0.0, 1.0), 120.0);
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.4);
  vec3 R = reflect(-V, N);
  vec3 env = mix(vec3(0.10, 0.09, 0.07), vec3(0.93, 0.90, 0.84), pow(clamp(R.y * 0.5 + 0.5, 0.0, 1.0), 1.15));
  env += vec3(0.55, 0.48, 0.36) * pow(clamp(dot(R, normalize(vec3(-0.35, 0.8, 0.4))), 0.0, 1.0), 8.0);
  vec3 base = vec3(0.62, 0.655, 0.67);
  vec3 cyan = vec3(0.494, 0.722, 0.706);
  vec3 gold = vec3(0.769, 0.643, 0.416);
  vec3 col = mix(base * (0.16 + 0.28 * ndl), env, 0.42 + 0.28 * fres);
  col += vec3(0.92, 0.95, 0.98) * spec * 1.85;
  col += mix(cyan, gold, 0.18) * fres * (0.22 + 0.45 * uPulse);
  col += cyan * uPulse * 0.12 * uIdleMul;
  col += mix(cyan, gold, 0.18) * ripple * 0.55;
  gl_FragColor = vec4(col, 1.0);
#include <colorspace_fragment>
}
`

export function createMercuryVolume(): THREE.Mesh {
  const balls = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.048, 0.048, 0.048),
    new THREE.Vector3(0.048, -0.048, -0.048),
    new THREE.Vector3(-0.048, 0.048, -0.048),
    new THREE.Vector3(-0.048, -0.048, 0.048)
  ]
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uLocalCam: { value: new THREE.Vector3(0, 0, 3) },
      uBalls: { value: balls },
      uRadii: { value: [0.155, 0.095, 0.095, 0.095, 0.095] },
      uRipples: {
        value: [new THREE.Vector4(1, 0, 1, 0), new THREE.Vector4(1, 0, 1, 0), new THREE.Vector4(1, 0, 1, 0)]
      },
      uTime: { value: 0 },
      uPulse: { value: 1 },
      uIdleMul: { value: 1 },
      uThreshold: { value: MERCURY_FIELD_THRESHOLD_DEFAULT },
      uNoiseAmt: { value: 0.04 },
      uRippleDisplace: { value: MERCURY_RIPPLE_DISPLACE_DEFAULT },
      uSmoothK: { value: MERCURY_SMOOTH_K_DEFAULT },
      uSteps: { value: 56 }
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: false,
    depthWrite: true,
    depthTest: true
  })
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(MERCURY_VOLUME_SIZE, MERCURY_VOLUME_SIZE, MERCURY_VOLUME_SIZE), mat)
  mesh.name = 'mercury-volume'
  mesh.visible = false
  mesh.frustumCulled = false
  return mesh
}

export function mercuryVolumeMaterial(mesh: THREE.Mesh): THREE.ShaderMaterial {
  return mesh.material as THREE.ShaderMaterial
}
