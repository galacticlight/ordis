import type { OperatorMemory } from '../types'
import {
  ingestOperatorUtterance,
  isRecallQuery,
  memoryChanged,
  recallSpeech
} from '../memory/operatorMemory'

export const HABITAT_TZ = 'America/Los_Angeles'
export const MAX_PENDING_TASKS = 20
export const MAX_DELAY_MS = 7 * 24 * 60 * 60 * 1000

export type HabitatTaskKind = 'timer' | 'reminder'

export interface HabitatTask {
  id: string
  kind: HabitatTaskKind
  dueAt: number
  prompt: string
  createdAt: number
}

export interface HabitatTurnInput {
  text: string
  memory: OperatorMemory
  tasks: HabitatTask[]
  now: number
  id?: () => string
}

export interface HabitatTurn {
  handled: boolean
  memory: OperatorMemory
  tasks: HabitatTask[]
  reply: string
}

export type TaskClockIo = {
  now: () => number
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (id: unknown) => void
  persist: (tasks: HabitatTask[]) => void
  onFire: (task: HabitatTask) => void
}

const DURATION_RE = /(\d+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)\b/i
const CLOCK_RE = /\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i

function clean(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().replace(/[.,;]+$/, '')
}

function tzOffsetMs(instant: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
  const map: Record<string, string> = {}
  for (const part of dtf.formatToParts(new Date(instant))) {
    if (part.type !== 'literal') map[part.type] = part.value
  }
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  )
  return asUtc - instant
}

export function zonedParts(
  instant: number,
  timeZone = HABITAT_TZ
): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
} {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
  const map: Record<string, string> = {}
  for (const part of dtf.formatToParts(new Date(instant))) {
    if (part.type !== 'literal') map[part.type] = part.value
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second)
  }
}

export function zonedWallToEpoch(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone = HABITAT_TZ
): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0)
  const instant = guess - tzOffsetMs(guess, timeZone)
  return guess - tzOffsetMs(instant, timeZone)
}

export function nextClockDue(
  hour24: number,
  minute: number,
  now: number,
  timeZone = HABITAT_TZ
): number {
  const parts = zonedParts(now, timeZone)
  let due = zonedWallToEpoch(parts.year, parts.month, parts.day, hour24, minute, timeZone)
  if (due <= now) {
    const nextNoon = zonedWallToEpoch(parts.year, parts.month, parts.day, 12, 0, timeZone) + 24 * 60 * 60 * 1000
    const tomorrow = zonedParts(nextNoon, timeZone)
    due = zonedWallToEpoch(tomorrow.year, tomorrow.month, tomorrow.day, hour24, minute, timeZone)
  }
  return due
}

function durationMs(amount: number, unitRaw: string): number | null {
  if (!Number.isFinite(amount) || amount <= 0) return null
  const unit = unitRaw.toLowerCase()
  let ms = 0
  if (unit.startsWith('sec')) ms = amount * 1000
  else if (unit.startsWith('min')) ms = amount * 60_000
  else if (unit.startsWith('hour') || unit.startsWith('hr')) ms = amount * 3_600_000
  else return null
  if (ms < 1000) return null
  return Math.min(ms, MAX_DELAY_MS)
}

function hour24FromClock(
  hour: number,
  minute: number,
  ampm: string
): { hour: number; minute: number } | null {
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null
  const mer = ampm.toLowerCase()
  let h = hour % 12
  if (mer === 'pm') h += 12
  return { hour: h, minute }
}

function extractPrompt(text: string): string {
  const to = /\bto\s+(.+)$/i.exec(text)
  if (to) return clean(to[1])
  const that = /\bthat\s+(.+)$/i.exec(text)
  if (that) return clean(that[1])
  return ''
}

function taskKind(text: string, clock: boolean): HabitatTaskKind {
  if (/\bremind/i.test(text)) return 'reminder'
  if (/\btimer/i.test(text)) return 'timer'
  return clock ? 'reminder' : 'timer'
}

export function isDumpQuery(text: string): boolean {
  return /\b(list (?:what you remember|your notes)|dump (?:memory|notes)|everything you remember|all (?:of )?(?:your |the )?notes)\b/i.test(
    text
  )
}

export function isCancelQuery(text: string): boolean {
  return /\b((?:cancel|never mind|nevermind)\s+(?:the\s+)?(?:timer|reminder)s?)\b/i.test(text)
}

export function isRememberCommand(text: string): boolean {
  if (isRecallQuery(text) || isDumpQuery(text)) return false
  return /\b(remember that|remember this|note that|don'?t forget)\b/i.test(text)
}

export function looksLikeSchedule(text: string): boolean {
  if (isCancelQuery(text) || isRecallQuery(text) || isRememberCommand(text)) return false
  if (/\b((?:set\s+(?:a\s+)?)?(?:timer|reminder)|remind me)\b/i.test(text)) return true
  const trimmed = text.trim()
  if (/^(?:please\s+)?in\s+\d+/i.test(trimmed)) return true
  if (/^(?:please\s+)?(?:remind me\s+)?at\s+\d/i.test(trimmed)) return true
  return false
}

export function parseSchedule(
  text: string,
  now: number,
  timeZone = HABITAT_TZ
): { kind: HabitatTaskKind; dueAt: number; prompt: string } | null {
  if (!looksLikeSchedule(text)) return null
  const clock = CLOCK_RE.exec(text)
  if (clock) {
    const hour = Number(clock[1])
    const minute = clock[2] ? Number(clock[2]) : 0
    const converted = hour24FromClock(hour, minute, clock[3] ?? 'am')
    if (!converted) return null
    const dueAt = nextClockDue(converted.hour, converted.minute, now, timeZone)
    const before = text.slice(0, clock.index)
    const after = text.slice(clock.index + clock[0].length)
    return {
      kind: taskKind(text, true),
      dueAt,
      prompt: extractPrompt(`${before} ${after}`)
    }
  }
  const duration = DURATION_RE.exec(text)
  if (!duration) return null
  const ms = durationMs(Number(duration[1]), duration[2] ?? '')
  if (ms === null) return null
  const before = text.slice(0, duration.index)
  const after = text.slice(duration.index + duration[0].length)
  return {
    kind: taskKind(text, false),
    dueAt: now + ms,
    prompt: extractPrompt(`${before} ${after}`)
  }
}

export function normalizeTasks(raw: unknown): HabitatTask[] {
  if (!Array.isArray(raw)) return []
  const out: HabitatTask[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    if (rec.kind !== 'timer' && rec.kind !== 'reminder') continue
    if (typeof rec.dueAt !== 'number' || !Number.isFinite(rec.dueAt)) continue
    const prompt = typeof rec.prompt === 'string' ? rec.prompt : ''
    const id = typeof rec.id === 'string' && rec.id.length > 0 ? rec.id : `task-${out.length}`
    const createdAt =
      typeof rec.createdAt === 'number' && Number.isFinite(rec.createdAt) ? rec.createdAt : rec.dueAt
    out.push({ id, kind: rec.kind, dueAt: rec.dueAt, prompt, createdAt })
    if (out.length >= MAX_PENDING_TASKS) break
  }
  return out
}

export function takeDue(
  tasks: HabitatTask[],
  now: number
): { due: HabitatTask[]; pending: HabitatTask[] } {
  const due: HabitatTask[] = []
  const pending: HabitatTask[] = []
  for (const task of tasks) {
    if (task.dueAt <= now) due.push(task)
    else pending.push(task)
  }
  due.sort((a, b) => a.dueAt - b.dueAt)
  return { due, pending }
}

function capitalize(value: string): string {
  if (!value) return value
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function formatWhen(dueAt: number, now: number, timeZone = HABITAT_TZ): string {
  const delay = dueAt - now
  if (delay <= 1500) return 'now'
  if (delay < 90_000) {
    const seconds = Math.max(1, Math.round(delay / 1000))
    return seconds === 1 ? 'in 1 second' : `in ${seconds} seconds`
  }
  if (delay < 90 * 60_000) {
    const minutes = Math.max(1, Math.round(delay / 60_000))
    return minutes === 1 ? 'in 1 minute' : `in ${minutes} minutes`
  }
  const parts = zonedParts(dueAt, timeZone)
  const mer = parts.hour >= 12 ? 'pm' : 'am'
  const hour12 = parts.hour % 12 === 0 ? 12 : parts.hour % 12
  const minutes = parts.minute === 0 ? '' : `:${String(parts.minute).padStart(2, '0')}`
  return `at ${hour12}${minutes}${mer}`
}

export function formatFireLine(task: HabitatTask): string {
  if (task.kind === 'timer') {
    if (task.prompt) return `Operator, the timer is complete. ${capitalize(task.prompt)}.`
    return 'Operator, the timer is complete.'
  }
  if (task.prompt) return `Operator, a reminder: ${task.prompt}.`
  return 'Operator, a reminder from Ordis.'
}

export function formatConfirmLine(task: HabitatTask, now: number): string {
  const when = formatWhen(task.dueAt, now)
  if (task.kind === 'timer') {
    return `It is done, Operator. Ordis will chime ${when}.`
  }
  if (task.prompt) {
    return `A reminder to ${task.prompt} is set ${when}, Operator.`
  }
  return `A reminder is set ${when}, Operator. Ordis will speak then.`
}

function cancelKind(text: string): HabitatTaskKind | undefined {
  const hasTimer = /\btimers?\b/i.test(text)
  const hasReminder = /\breminders?\b/i.test(text)
  if (hasTimer && !hasReminder) return 'timer'
  if (hasReminder && !hasTimer) return 'reminder'
  return undefined
}

function confirmRemember(before: OperatorMemory, after: OperatorMemory): string {
  const likes = after.likes.filter((value) => !before.likes.includes(value))
  if (likes.length > 0) {
    return `Logged, Operator. Ordis will keep that you like ${likes.join(', ')} among the habitat notes.`
  }
  const work = after.facts.work
  if (work && work !== before.facts.work) {
    return `Logged, Operator. Ordis will remember that you work ${work}.`
  }
  return 'Logged, Operator. Ordis will keep that among the habitat notes.'
}

export function handleHabitatTurn(input: HabitatTurnInput): HabitatTurn {
  const text = input.text.trim()
  const memory = input.memory
  const tasks = input.tasks
  const now = input.now
  const makeId = input.id ?? (() => `task-${now}-${Math.random().toString(16).slice(2, 10)}`)

  if (isCancelQuery(text)) {
    const kind = cancelKind(text)
    const matches = tasks.filter((task) => !kind || task.kind === kind).sort((a, b) => a.dueAt - b.dueAt)
    const target = matches[0]
    if (!target) {
      const label = kind ?? 'timer or reminder'
      return {
        handled: true,
        memory,
        tasks,
        reply: `There is no pending ${label} to cancel, Operator.`
      }
    }
    return {
      handled: true,
      memory,
      tasks: tasks.filter((task) => task.id !== target.id),
      reply: `Cancelled, Operator. Ordis has released that ${target.kind}.`
    }
  }

  if (isRecallQuery(text) || isDumpQuery(text)) {
    return {
      handled: true,
      memory,
      tasks,
      reply: recallSpeech(memory, isDumpQuery(text))
    }
  }

  if (looksLikeSchedule(text)) {
    const parsed = parseSchedule(text, now)
    if (!parsed) {
      return {
        handled: true,
        memory,
        tasks,
        reply:
          'Ordis can hold a timer or reminder without Harbor, Operator. Name a duration or a time of day — in twenty minutes, at 3pm.'
      }
    }
    if (tasks.length >= MAX_PENDING_TASKS) {
      return {
        handled: true,
        memory,
        tasks,
        reply:
          'Operator, the habitat already holds twenty pending timers and reminders. Cancel one, and Ordis will schedule another.'
      }
    }
    const task: HabitatTask = {
      id: makeId(),
      kind: parsed.kind,
      dueAt: parsed.dueAt,
      prompt: parsed.prompt,
      createdAt: now
    }
    return {
      handled: true,
      memory,
      tasks: [...tasks, task],
      reply: formatConfirmLine(task, now)
    }
  }

  if (isRememberCommand(text)) {
    const next = ingestOperatorUtterance(memory, text)
    if (!memoryChanged(memory, next)) {
      return {
        handled: true,
        memory: next,
        tasks,
        reply: 'Ordis is listening, Operator. Phrase a preference, and it will be kept.'
      }
    }
    return {
      handled: true,
      memory: next,
      tasks,
      reply: confirmRemember(memory, next)
    }
  }

  return { handled: false, memory, tasks, reply: '' }
}

export function createTaskClock(io: TaskClockIo): {
  restore: (tasks: HabitatTask[]) => void
  replace: (tasks: HabitatTask[]) => void
  snapshot: () => HabitatTask[]
  stop: () => void
} {
  let tasks: HabitatTask[] = []
  const handles = new Map<string, unknown>()

  function disarm(id: string): void {
    const handle = handles.get(id)
    if (handle !== undefined) io.clearTimeout(handle)
    handles.delete(id)
  }

  function arm(task: HabitatTask): void {
    disarm(task.id)
    const delay = Math.max(0, task.dueAt - io.now())
    const handle = io.setTimeout(() => {
      handles.delete(task.id)
      const found = tasks.find((item) => item.id === task.id)
      if (!found) return
      tasks = tasks.filter((item) => item.id !== task.id)
      io.persist(tasks)
      io.onFire(found)
    }, delay)
    handles.set(task.id, handle)
  }

  function replace(next: HabitatTask[]): void {
    for (const id of [...handles.keys()]) disarm(id)
    tasks = next.slice(0, MAX_PENDING_TASKS)
    io.persist(tasks)
    for (const task of tasks) arm(task)
  }

  return {
    restore(next: HabitatTask[]): void {
      const { due, pending } = takeDue(normalizeTasks(next), io.now())
      replace(pending)
      for (const task of due) io.onFire(task)
    },
    replace,
    snapshot: () => [...tasks],
    stop(): void {
      for (const id of [...handles.keys()]) disarm(id)
    }
  }
}

export function playbackAllowed(state: { interactive: boolean; clickThrough: boolean }): boolean {
  return state.interactive && !state.clickThrough
}

export const REMINDER_FIRE_STEPS = [
  'persist',
  'due',
  'wake-overlay',
  'focus-composer',
  'speak'
] as const

export function reminderFireSteps(): readonly string[] {
  return REMINDER_FIRE_STEPS
}
