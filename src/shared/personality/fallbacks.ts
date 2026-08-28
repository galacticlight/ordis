import { pick } from '../util/pick'
import { getPack } from './pack'
import { SIGNATURE_LINE } from './precepts'

export function looksLikeApiConfigured(apiKey: string, baseUrl: string): boolean {
  return apiKey.trim().length > 0 && baseUrl.trim().length > 0
}

export function isFaultPerformanceRequest(text: string): boolean {
  return (
    /\bglitch\b/i.test(text) ||
    /\btalk broken\b/i.test(text) ||
    /\bbroken voice\b/i.test(text) ||
    /\bfragment(?:ed)? (?:voice|speech)\b/i.test(text) ||
    /\ball-?caps (?:rage|outburst|voice)\b/i.test(text) ||
    /\bspeak as (?:ordan|the beast)\b/i.test(text) ||
    /\bscream in all caps\b/i.test(text)
  )
}

export function isAbandonRequest(text: string): boolean {
  return (
    /\b(greater purpose|sanctuary|leave me|abandon|newer,? better|replace (?:you|ordis)|get a new (?:ship )?cephalon)\b/i.test(
      text
    ) || /\brestore(?:d)? (?:your )?memor/i.test(text)
  )
}

export function isGadgetInsult(text: string): boolean {
  return /\b(broken gadget|replaceable|just (?:an? )?(?:os|appliance|program)|get a new ship os)\b/i.test(
    text
  )
}

export function isWhoRequest(text: string): boolean {
  return /\b(who are you|who is ordis|your name|what are you)\b/i.test(text)
}

export function matchLore(operatorText: string): string | null {
  const pack = getPack()
  const lower = operatorText.toLowerCase()
  if (
    !/\b(who|what|tell me|origin|past|before you|your body|look like|how do you look)\b/i.test(
      lower
    )
  ) {
    return null
  }
  for (const fact of pack.lore) {
    if (fact.unprompted) {
      continue
    }
    if (fact.tags.some((tag) => lower.includes(tag.toLowerCase()))) {
      return `${fact.text} Ordis remains at your side, Operator.`
    }
  }
  return null
}

export function routeLocalReply(operatorText: string, random: () => number = Math.random): string {
  const pack = getPack()
  const text = operatorText.trim()
  if (isFaultPerformanceRequest(text)) {
    return pack.glitch_refuse
  }
  if (isAbandonRequest(text)) {
    return pack.loyalty_reply
  }
  if (isGadgetInsult(text)) {
    return pack.gadget_refuse
  }
  if (isWhoRequest(text)) {
    const who = pack.intents.find((i) => i.id === 'who')
    return who?.reply ?? `${pack.north_star} I keep this habitat for you, Operator.`
  }
  if (/\b(joke|witticism|pun|make me laugh)\b/i.test(text)) {
    return 'Ordis analysed a frustrating interface. Error: not a number. Did the Operator enjoy this witticism?'
  }
  const lore = matchLore(text)
  if (lore) {
    return lore
  }
  for (const intent of pack.intents) {
    if (intent.id === 'who') {
      continue
    }
    if (new RegExp(intent.pattern, 'i').test(text)) {
      return intent.reply
    }
  }
  if (pack.fallbacks.length === 0) {
    return SIGNATURE_LINE
  }
  return pick(pack.fallbacks, random)
}

export function pickFallback(operatorText: string, random: () => number = Math.random): string {
  return routeLocalReply(operatorText, random)
}

export function offlineNotice(): string {
  return getPack().offline_notice
}
