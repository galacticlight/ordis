export class PlaintextKeyRefused extends Error {
  constructor() {
    super("OS encryption is required. Ordis will not store a plaintext key.")
    this.name = "PlaintextKeyRefused"
  }
}

export interface SecretDisk {
  enc?: string
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

/** Drop any leftover `plain` field. Never read its value. */
export function scrubSecretDisk(raw: Record<string, unknown> | null | undefined): SecretDisk {
  if (!raw || typeof raw !== "object") return {}
  const out: SecretDisk = {}
  if (typeof raw.enc === "string" && raw.enc.length > 0) out.enc = raw.enc
  return out
}

export function leftoverPlain(raw: Record<string, unknown> | null | undefined): boolean {
  return Boolean(raw && Object.prototype.hasOwnProperty.call(raw, "plain"))
}

/** Never returns a plaintext fallback. Legacy plaintext disks are treated as empty. */
export function unpackSecret(disk: SecretDisk | null | undefined, box: SecretBox): string {
  if (!disk) {
    return ""
  }
  if (disk.enc && box.isAvailable()) {
    try {
      return box.decrypt(disk.enc)
    } catch {
      return ""
    }
  }
  return ""
}
