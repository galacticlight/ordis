export const HIT_FRACTION = {
  left: 0.16,
  top: 0.04,
  width: 0.58,
  height: 0.52
} as const

export function isOverHit(
  localX: number,
  localY: number,
  windowWidth: number,
  windowHeight: number,
  fraction = HIT_FRACTION
): boolean {
  if (windowWidth <= 0 || windowHeight <= 0) return false
  const left = windowWidth * fraction.left
  const top = windowHeight * fraction.top
  const right = left + windowWidth * fraction.width
  const bottom = top + windowHeight * fraction.height
  return localX >= left && localX <= right && localY >= top && localY <= bottom
}

export function isOverWindow(
  screenX: number,
  screenY: number,
  bounds: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    screenX >= bounds.x &&
    screenX < bounds.x + bounds.width &&
    screenY >= bounds.y &&
    screenY < bounds.y + bounds.height
  )
}
