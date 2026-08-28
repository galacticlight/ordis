export function pick<T>(items: readonly T[], random: () => number = Math.random): T {
  if (items.length === 0) {
    throw new Error('Cannot pick from an empty list')
  }
  const index = Math.min(items.length - 1, Math.floor(random() * items.length))
  return items[index] as T
}
