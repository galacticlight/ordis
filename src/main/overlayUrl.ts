/** Build the overlay or settings URL, including the optional mercury spike query. */

export function overlayPageUrl(
  page: 'index' | 'settings',
  devOrigin: string | null | undefined,
  fileUrl: string,
  mercury = process.env.ORDIS_MERCURY
): string {
  const origin = devOrigin?.replace(/\/$/, '') || ''
  const url = origin ? (page === 'index' ? origin : `${origin}/${page}.html`) : fileUrl
  if (page !== 'index' || mercury !== 'raymarch') return url
  const parsed = new URL(url)
  parsed.searchParams.set('mercury', 'raymarch')
  return parsed.toString()
}
