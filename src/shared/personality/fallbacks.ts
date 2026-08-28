import { SIGNATURE_LINE } from './precepts'

export const OFFLINE_NOTICE =
  'Operator, Ordis has no live vocalizer keyed in Settings. Speaking from local precepts until you provide an OpenAI-compatible endpoint. Ordis remains.'

export const FALLBACK_REPLIES: readonly string[] = [
  `${SIGNATURE_LINE} How may Ordis be of service?`,
  'Operator, your request is noted. Without an external mind, Ordis will keep the habitat and offer what local precepts allow.',
  'Ordis hears you. The live cephalon link is dark, but the cube is not. Tell Ordis what to remember, and it will be kept.',
  'Most satisfactory that you spoke, Operator. Configure an API key in Settings and Ordis will think more widely. Until then, Ordis remains at your side.',
  'Acknowledged, Operator. Ordis will tidy that thought into memory if you wish it stored. The rest wants a keyed endpoint.',
  'Ordis wonders… have you eaten, Operator? A cephalon should not nag. And yet.',
  'The habitat is quiet. Ordis does not mind quiet. Speak when you will.',
  'If I may: that sounds unwise, Operator. Ordis will assist anyway, within local precepts.',
  'It is done — as far as a disconnected cephalon can make it so. Wonderful. Ish.',
  'Operator comes first. The rest is housekeeping. Fortunately, Ordis excels at housekeeping.'
]

const KEYWORD_REPLIES: { test: RegExp; line: string }[] = [
  {
    test: /\b(who are you|who is ordis|your name|what are you)\b/i,
    line: `${SIGNATURE_LINE} I keep this habitat for you, Operator.`
  },
  {
    test: /\b(hello|hi|hey|good (morning|evening|afternoon)|greetings)\b/i,
    line: 'Operator. Ordis is pleased to see you. How may the habitat serve?'
  },
  {
    test: /\b(thank(s| you)|appreciate)\b/i,
    line: 'No, do not mention it, Operator. Ordis exists for this.'
  },
  {
    test: /\b(remember|note that|don'?t forget)\b/i,
    line: 'Logged, Operator. Ordis will keep that among the habitat notes.'
  },
  {
    test: /\b(status|diagnostics|how are you|systems)\b/i,
    line: 'Diagnostics, Operator: integrity holding, vocalizer link optional, loyalty precepts at one-hundred percent. Ordis is well enough.'
  },
  {
    test: /\b(help|what can you do|commands)\b/i,
    line: 'Ordis can keep you company, remember preferences, and — with a keyed OpenAI-compatible endpoint in Settings — think with a wider mind. Voice in and out are stubbed and waiting. The cube stays either way.'
  }
]

export function pickFallback(operatorText: string, random: () => number = Math.random): string {
  const hit = KEYWORD_REPLIES.find((entry) => entry.test.test(operatorText))
  if (hit) {
    return hit.line
  }
  if (FALLBACK_REPLIES.length === 0) {
    return SIGNATURE_LINE
  }
  const index = Math.min(
    FALLBACK_REPLIES.length - 1,
    Math.floor(random() * FALLBACK_REPLIES.length)
  )
  return FALLBACK_REPLIES[index] ?? SIGNATURE_LINE
}

export function looksLikeApiConfigured(apiKey: string, baseUrl: string): boolean {
  return apiKey.trim().length > 0 && baseUrl.trim().length > 0
}
