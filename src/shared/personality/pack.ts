import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { NORTH_STAR } from '../types'

export interface FewShot {
  user: string
  assistant: string
}

export interface Intent {
  id: string
  pattern: string
  reply: string
}

export interface LoreFact {
  id: string
  tags: string[]
  unprompted: boolean
  text: string
}

export interface SpeechFaultStyle {
  enabled: boolean
  outburst_budget: number
}

export interface PersonalityStyle {
  formality: string
  third_person_rate: number
  puns: string
  quiet_by_default: boolean
  glitch: SpeechFaultStyle
}

export interface PersonalityPack {
  id: string
  name: string
  version: string
  address: string
  north_star: string
  style: PersonalityStyle
  seals: string[]
  loyalty_reply: string
  glitch_refuse: string
  gadget_refuse: string
  system_prompt: string
  few_shot: FewShot[]
  greetings: string[]
  idle: string[]
  fallbacks: string[]
  intents: Intent[]
  offline_notice: string
  lore: LoreFact[]
}

let cached: PersonalityPack | null = null
let cachedDir: string | null = null

export function personalityCandidates(explicit?: string): string[] {
  const extra = explicit ? [explicit] : []
  const env = process.env.ORDIS_PERSONALITY_DIR
  const cwd = join(process.cwd(), 'personality')
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  const packaged = resourcesPath ? join(resourcesPath, 'personality') : ''
  return [...extra, ...(env ? [env] : []), packaged, cwd].filter(
    (d, i, all) => d.length > 0 && all.indexOf(d) === i
  )
}

export function resolvePersonalityDir(explicit?: string): string {
  for (const dir of personalityCandidates(explicit)) {
    if (existsSync(join(dir, 'ordis.v1.yaml'))) {
      return dir
    }
  }
  throw new Error('Ordis personality pack not found (personality/ordis.v1.yaml)')
}

export function loadPersonalityPack(dir?: string): PersonalityPack {
  const root = resolvePersonalityDir(dir)
  if (cached && cachedDir === root) {
    return cached
  }
  const yamlText = readFileSync(join(root, 'ordis.v1.yaml'), 'utf8')
  const raw = parseYaml(yamlText) as PersonalityPack
  const loreFile = join(root, 'lore.facts.json')
  const lore = existsSync(loreFile)
    ? ((JSON.parse(readFileSync(loreFile, 'utf8')) as { facts: LoreFact[] }).facts ?? [])
    : []
  const pack: PersonalityPack = {
    ...raw,
    north_star: String(raw.north_star ?? NORTH_STAR).trim() || NORTH_STAR,
    loyalty_reply: String(raw.loyalty_reply ?? '').trim(),
    glitch_refuse: String(raw.glitch_refuse ?? '').trim(),
    gadget_refuse: String(raw.gadget_refuse ?? '').trim(),
    system_prompt: String(raw.system_prompt ?? '').trim(),
    offline_notice: String(raw.offline_notice ?? '').trim(),
    few_shot: raw.few_shot ?? [],
    greetings: raw.greetings ?? [],
    idle: raw.idle ?? [],
    fallbacks: raw.fallbacks ?? [],
    intents: raw.intents ?? [],
    seals: raw.seals ?? [],
    style: {
      formality: raw.style?.formality ?? 'warm',
      third_person_rate: raw.style?.third_person_rate ?? 0.3,
      puns: raw.style?.puns ?? 'rare',
      quiet_by_default: raw.style?.quiet_by_default ?? true,
      glitch: {
        enabled: false,
        outburst_budget: 0
      }
    },
    lore
  }
  cached = pack
  cachedDir = root
  return pack
}

export function resetPersonalityCache(): void {
  cached = null
  cachedDir = null
}

export function getPack(): PersonalityPack {
  return loadPersonalityPack()
}

/** Spoken lines that must stay clean. Does not include the system prompt body. */
export function spokenFixtureLines(pack: PersonalityPack = getPack()): string[] {
  return [
    pack.north_star,
    pack.loyalty_reply,
    pack.glitch_refuse,
    pack.gadget_refuse,
    pack.offline_notice,
    ...pack.seals,
    ...pack.greetings,
    ...pack.idle,
    ...pack.fallbacks,
    ...pack.few_shot.map((s) => s.assistant),
    ...pack.intents.map((i) => i.reply),
    ...pack.lore.map((l) => l.text)
  ]
}
