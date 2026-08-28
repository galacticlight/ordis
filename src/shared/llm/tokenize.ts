/** Stream a finished line in word-sized tokens so the overlay can animate. */
export function tokenizeForStream(text: string): string[] {
  const parts = text.split(/(\s+)/)
  const tokens: string[] = []
  let buffer = ''
  for (const part of parts) {
    buffer += part
    if (part.trim().length === 0) {
      continue
    }
    tokens.push(buffer)
    buffer = ''
  }
  if (buffer.length > 0) {
    tokens.push(buffer)
  }
  return tokens
}
