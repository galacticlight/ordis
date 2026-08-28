export class PlaintextKeyRefused extends Error {
  constructor() {
    super('OS encryption is required. Ordis will not store a plaintext key.')
    this.name = 'PlaintextKeyRefused'
  }
}

export interface SecretDisk {
  enc?: string
  plain?: string
}

export interface SecretBox {
  isAvailable(): boolean
  encrypt(value: string): string
  decrypt(enc: string): string
}

export function packSecret(value: string, box: SecretBox): SecretDisk {
  if (!value) {
    return {}
  }
  if (!box.isAvailable()) {
    throw new PlaintextKeyRefused()
  }
  return { enc: box.encrypt(value) }
}

/** Never returns a `plain` fallback. Legacy plaintext disks are treated as empty. */
export function unpackSecret(disk: SecretDisk | null | undefined, box: SecretBox): string {
  if (!disk) {
    return ''
  }
  if (disk.enc && box.isAvailable()) {
    try {
      return box.decrypt(disk.enc)
    } catch {
      return ''
    }
  }
  return ''
}

export function hasPlaintextFallback(disk: SecretDisk | null | undefined): boolean {
  return Boolean(disk?.plain)
}
