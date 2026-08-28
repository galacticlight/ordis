import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { CUBE_GLYPH_POSITION, OVERLAY_FRUSTUM } from '../src/renderer/src/avatar/OrdisAvatar'

const CUBE_HALF = 0.21
const CUBE_CORNER = Math.sqrt(3) * CUBE_HALF

function overlayCamera(width: number, height: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(32, width / Math.max(height, 1), 0.1, 20)
  camera.position.set(0, 0.12, 4.35)
  camera.lookAt(0, 0.05, 0)
  camera.updateMatrixWorld()
  camera.updateProjectionMatrix()
  return camera
}

function glyphSamplePoints(): THREE.Vector3[] {
  const [x, y, z] = CUBE_GLYPH_POSITION
  const pts: THREE.Vector3[] = []
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        pts.push(new THREE.Vector3(x + sx * CUBE_HALF, y + sy * CUBE_HALF, z + sz * CUBE_HALF))
      }
    }
  }
  for (const t of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
    pts.push(new THREE.Vector3(x + CUBE_CORNER * Math.cos(t), y + CUBE_CORNER * Math.sin(t), z))
    pts.push(new THREE.Vector3(x, y + CUBE_CORNER * Math.cos(t), z + CUBE_CORNER * Math.sin(t)))
    pts.push(new THREE.Vector3(x + CUBE_CORNER * Math.cos(t), y, z + CUBE_CORNER * Math.sin(t)))
  }
  pts.push(new THREE.Vector3(x, y, z + 0.22 + 0.128))
  return pts
}

describe('cube glyph frustum', () => {
  it('sits fully inside the 420x640 overlay camera', () => {
    const camera = overlayCamera(OVERLAY_FRUSTUM.width, OVERLAY_FRUSTUM.height)
    for (const point of glyphSamplePoints()) {
      const ndc = point.clone().project(camera)
      expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1)
      expect(ndc.z).toBeGreaterThanOrEqual(-1)
      expect(ndc.z).toBeLessThanOrEqual(1)
    }
  })

  it('does not bob the glyph; Sentinel remains in this commit', () => {
    const src = readFileSync(join(process.cwd(), 'src/renderer/src/avatar/OrdisAvatar.ts'), 'utf8')
    expect(src).toContain('this.glyph.rotation.y')
    expect(src).not.toMatch(/this\.glyph\.position\.(x|y|z)\s*=/)
    expect(src).toContain('createSentinel')
    expect(src).not.toMatch(/hexahedron|Kokoro|darwin-arm64/)
  })
})
