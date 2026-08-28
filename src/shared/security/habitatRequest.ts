export type HabitatAllowOrigins = {
  devOrigin?: string | null
  vocalizerOrigin?: string | null
}

const LOCAL_SCHEMES = new Set(['file:', 'devtools:', 'blob:', 'data:'])

function parseUrl(value: string | null | undefined): URL | null {
  if (!value) return null
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function defaultPort(protocol: string): string {
  if (protocol === 'https:' || protocol === 'wss:') return '443'
  if (protocol === 'http:' || protocol === 'ws:') return '80'
  return ''
}

function effectivePort(url: URL): string {
  return url.port || defaultPort(url.protocol)
}

function protocolPair(allowed: string, request: string): boolean {
  if (allowed === 'https:' || allowed === 'wss:') {
    return request === 'https:' || request === 'wss:'
  }
  if (allowed === 'http:' || allowed === 'ws:') {
    return request === 'http:' || request === 'ws:'
  }
  return allowed === request
}

function originAllows(request: URL, allowedRaw: string | null | undefined): boolean {
  const allowed = parseUrl(allowedRaw)
  if (!allowed) return false
  if (!request.hostname || !allowed.hostname) return false
  if (request.hostname !== allowed.hostname) return false
  if (effectivePort(request) !== effectivePort(allowed)) return false
  return protocolPair(allowed.protocol, request.protocol)
}

/** Allow renderer session requests only for local schemes or an exact origin (host+port, http(s)/ws(s) pair). Never prefix-match. */
export function isHabitatRequestAllowed(url: string, origins: HabitatAllowOrigins): boolean {
  const request = parseUrl(url)
  if (!request) return false
  if (LOCAL_SCHEMES.has(request.protocol)) return true
  return originAllows(request, origins.devOrigin) || originAllows(request, origins.vocalizerOrigin)
}

export function habitatConnectSrc(origins: HabitatAllowOrigins): string[] {
  const out: string[] = []
  const add = (raw: string | null | undefined): void => {
    const allowed = parseUrl(raw)
    if (!allowed) return
    const origin = allowed.origin
    if (!out.includes(origin)) out.push(origin)
    if (allowed.protocol === 'http:') {
      const ws = origin.replace('http://', 'ws://')
      if (!out.includes(ws)) out.push(ws)
    } else if (allowed.protocol === 'https:') {
      const wss = origin.replace('https://', 'wss://')
      if (!out.includes(wss)) out.push(wss)
    }
  }
  add(origins.devOrigin)
  add(origins.vocalizerOrigin)
  return out
}

export function overlayContentSecurityPolicy(origins: HabitatAllowOrigins): string {
  const extra = habitatConnectSrc(origins)
  const connect = ["'self'", ...extra].join(' ')
  return `default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; connect-src ${connect}; media-src 'self'`
}
