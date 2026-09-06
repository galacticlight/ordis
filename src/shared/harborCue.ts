/** Quiet Harbor vs steward status copy for Settings and overlay. Never includes secrets. */
export function harborLinkCue(hasApiKey: boolean): string {
  return hasApiKey
    ? 'Harbor linked · Grok ready'
    : 'Speaking from local precepts · Harbor optional'
}
