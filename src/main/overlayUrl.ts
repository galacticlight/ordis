/** Build the overlay or settings URL, including the optional mercury spike query. */

export function resolveMercuryFlag(
  env: string | undefined = process.env.ORDIS_MERCURY,
  argv: readonly string[] = process.argv
): string | undefined {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg) continue
    if (arg.startsWith('--mercury=')) return arg.slice('--mercury='.length) || undefined
    if (arg === '--mercury') {
      const next = argv[i + 1]
      return next && !next.startsWith('-') ? next : 'raymarch'
    }
  }
  return env || undefined
}

export function overlayPageUrl(
  page: 'index' | 'settings',
  devOrigin: string | null | undefined,
  fileUrl: string,
  mercury = resolveMercuryFlag()
): string {
  const origin = devOrigin?.replace(/\/$/, '') || ''
  const url = origin ? (page === 'index' ? origin : `${origin}/${page}.html`) : fileUrl
  if (page !== 'index' || mercury !== 'raymarch') return url
  const parsed = new URL(url)
  parsed.searchParams.set('mercury', 'raymarch')
  return parsed.toString()
}
