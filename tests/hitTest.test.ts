import { describe, expect, it } from 'vitest'
import { isOverHit, isOverWindow } from '@shared/overlay/hitTest'

describe('hitTest', () => {
  it('matches the idle overlay hit fraction inside a 420x640 window', () => {
    expect(isOverHit(210, 200, 420, 640)).toBe(true)
    expect(isOverHit(10, 10, 420, 640)).toBe(false)
    expect(isOverHit(400, 20, 420, 640)).toBe(false)
  })

  it('detects leaving the overlay bounds so tuck can re-arm hover', () => {
    const bounds = { x: 100, y: 50, width: 420, height: 640 }
    expect(isOverWindow(200, 100, bounds)).toBe(true)
    expect(isOverWindow(99, 100, bounds)).toBe(false)
  })
})
