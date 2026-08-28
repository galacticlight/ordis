import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  CAMERA_POSE,
  MOTION,
  OVERLAY_FRUSTUM,
  PALETTE,
  SEAL_POSITION,
  SEAL_SIZE
} from '../src/renderer/src/avatar/OrdisAvatar'

const CUBE_HALF = SEAL_SIZE / 2

function overlayCamera(width: number, height: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(CAMERA_POSE.fov, width / Math.max(height, 1), 0.1, 20)
  camera.position.set(...CAMERA_POSE.position)
  camera.lookAt(...CAMERA_POSE.lookAt)
  camera.updateMatrixWorld()
  camera.updateProjectionMatrix()
  return camera
}

function sealSamplePoints(): THREE.Vector3[] {
  const [x, y, z] = SEAL_POSITION
  const pts: THREE.Vector3[] = []
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        pts.push(new THREE.Vector3(x + sx * CUBE_HALF, y + sy * CUBE_HALF, z + sz * CUBE_HALF))
      }
    }
  }
  pts.push(new THREE.Vector3(x, y, z))
  return pts
}

describe('cube-seal frustum', () => {
  it('sits fully inside the 420x640 overlay camera', () => {
    const camera = overlayCamera(OVERLAY_FRUSTUM.width, OVERLAY_FRUSTUM.height)
    for (const point of sealSamplePoints()) {
      const ndc = point.clone().project(camera)
      expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1)
      expect(ndc.z).toBeGreaterThanOrEqual(-1)
      expect(ndc.z).toBeLessThanOrEqual(1)
    }
  })

  it('replaces the Sentinel with a centered optical-glass seal', () => {
    const src = readFileSync(join(process.cwd(), 'src/renderer/src/avatar/OrdisAvatar.ts'), 'utf8')
    expect(src).toContain('function createSeal')
    expect(src).toContain('RoomEnvironment')
    expect(src).toContain('ACESFilmicToneMapping')
    expect(src).toContain('MeshPhysicalMaterial')
    expect(src).not.toContain('createSentinel')
    expect(src).not.toContain('EdgesGeometry')
    expect(src).not.toMatch(/LatheGeometry/)
    expect(src).not.toMatch(/this\.glyph\.rotation\.y\s*=\s*t\s*\*/)
    expect(MOTION.idleBreathWorld).toBeLessThanOrEqual(0.002)
    expect(MOTION.idlePrecessionRad).toBeLessThanOrEqual((2 * Math.PI) / 180)
    expect(PALETTE.gold).toBe(0xc4a46a)
    expect(PALETTE.cyan).toBe(0x7eb8b4)
    expect(PALETTE.ivory).toBe(0xf4ebda)
  })
})

describe('habitat palette', () => {
  it('uses antique gold and serif captions, not costume gold or Trebuchet', () => {
    const overlay = readFileSync(join(process.cwd(), 'src/renderer/src/overlay.css'), 'utf8')
    const settings = readFileSync(join(process.cwd(), 'src/renderer/src/settings.css'), 'utf8')
    expect(overlay).toContain('--gold: #c4a46a')
    expect(overlay).toContain('--ivory: #f4ebda')
    expect(overlay).toContain('--cyan: #7eb8b4')
    expect(overlay).toContain('Cormorant Garamond')
    expect(overlay).not.toMatch(/#d4af37/)
    expect(overlay).not.toMatch(/Trebuchet/)
    expect(settings).toContain('--gold: #c4a46a')
    expect(settings).toContain('--ink: #12110e')
    expect(settings).not.toMatch(/#d4af37/)
    expect(settings).not.toMatch(/Trebuchet/)
  })
})
