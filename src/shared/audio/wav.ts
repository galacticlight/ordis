export interface Pcm16Wav {
  sampleRate: number
  channels: number
  pcm: Int16Array
}

export function int16ToFloat32(input: Int16Array): Float32Array {
  const out = new Float32Array(input.length)
  for (let i = 0; i < input.length; i++) {
    out[i] = input[i] / 32768
  }
  return out
}

export function float32ToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    let sample = input[i]
    if (!Number.isFinite(sample)) sample = 0
    if (sample > 1) sample = 1
    else if (sample < -1) sample = -1
    const scaled = Math.round(sample * 32768)
    out[i] = scaled > 32767 ? 32767 : scaled < -32768 ? -32768 : scaled
  }
  return out
}

function readFourCc(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!)
}

/**
 * Parse 16-bit PCM WAV. Extra fmt bytes and unknown chunks are skipped.
 * Streaming writers (espeak-ng --stdout) may claim a huge data size; clamp to remaining bytes.
 */
export function parsePcm16Wav(input: Uint8Array | ArrayBuffer): Pcm16Wav {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  if (bytes.byteLength < 12) {
    throw new Error('wav too short')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (readFourCc(bytes, 0) !== 'RIFF' || readFourCc(bytes, 8) !== 'WAVE') {
    throw new Error('not a riff/wave file')
  }

  let offset = 12
  let sampleRate = 0
  let channels = 0
  let bits = 0
  let format = 0
  let pcm: Int16Array | null = null

  while (offset + 8 <= bytes.byteLength) {
    const id = readFourCc(bytes, offset)
    const declared = view.getUint32(offset + 4, true)
    const dataStart = offset + 8
    if (dataStart > bytes.byteLength) break
    const available = bytes.byteLength - dataStart
    const size = declared > available ? available : declared

    if (id === 'fmt ') {
      if (size < 16) {
        throw new Error('fmt chunk too small')
      }
      format = view.getUint16(dataStart, true)
      channels = view.getUint16(dataStart + 2, true)
      sampleRate = view.getUint32(dataStart + 4, true)
      bits = view.getUint16(dataStart + 14, true)
    } else if (id === 'data') {
      const even = size - (size % 2)
      const samples = even / 2
      const copy = new Int16Array(samples)
      const dataView = new DataView(bytes.buffer, bytes.byteOffset + dataStart, even)
      for (let i = 0; i < samples; i++) {
        copy[i] = dataView.getInt16(i * 2, true)
      }
      pcm = copy
      break
    }

    let next = dataStart + declared
    if (declared % 2 === 1) next += 1
    if (next <= offset) break
    offset = next
  }

  if (!pcm || format !== 1 || bits !== 16 || sampleRate < 1 || channels < 1) {
    throw new Error('unsupported wav (need pcm s16)')
  }
  return { sampleRate, channels, pcm }
}

export function writePcm16Wav(pcm: Int16Array, sampleRate: number, channels = 1): Uint8Array {
  const dataBytes = pcm.byteLength
  const bytes = new Uint8Array(44 + dataBytes)
  const view = new DataView(bytes.buffer)
  const stamp = (at: number, text: string): void => {
    for (let i = 0; i < text.length; i++) bytes[at + i] = text.charCodeAt(i)
  }
  stamp(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  stamp(8, 'WAVE')
  stamp(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * channels * 2, true)
  view.setUint16(32, channels * 2, true)
  view.setUint16(34, 16, true)
  stamp(36, 'data')
  view.setUint32(40, dataBytes, true)
  bytes.set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength), 44)
  return bytes
}
