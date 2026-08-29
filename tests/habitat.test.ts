import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createMemory, ingestOperatorUtterance, recallSpeech } from '@shared/memory/operatorMemory'
import { isClean } from '@shared/personality/traps'
import {
  createTaskClock,
  formatFireLine,
  handleHabitatTurn,
  MAX_PENDING_TASKS,
  nextClockDue,
  parseSchedule,
  takeDue,
  playbackAllowed,
  reminderFireSteps,
  type HabitatTask
} from '@shared/habitat/tasks'

const root = process.cwd()
const emptyKey = { apiKey: '', apiBaseUrl: '' }

describe('unharbored habitat tasks', () => {
  it('persists remember, timer, and reminder with an empty api key', () => {
    expect(emptyKey.apiKey).toBe('')
    const remember = handleHabitatTurn({
      text: 'remember that I like tea',
      memory: createMemory(),
      tasks: [],
      now: 0
    })
    expect(remember.handled).toBe(true)
    expect(remember.memory.likes).toContain('tea')
    expect(isClean(remember.reply)).toBe(true)
    expect(remember.reply).toMatch(/Operator/)

    const timer = handleHabitatTurn({
      text: 'timer 5 minutes',
      memory: remember.memory,
      tasks: [],
      now: 1_000,
      id: () => 'timer-1'
    })
    expect(timer.handled).toBe(true)
    expect(timer.tasks).toHaveLength(1)
    expect(timer.tasks[0]?.kind).toBe('timer')
    expect(timer.tasks[0]?.dueAt).toBe(1_000 + 5 * 60_000)

    const reminder = handleHabitatTurn({
      text: 'remind me in 10 minutes to stretch',
      memory: remember.memory,
      tasks: timer.tasks,
      now: 1_000,
      id: () => 'rem-1'
    })
    expect(reminder.handled).toBe(true)
    expect(reminder.tasks).toHaveLength(2)
    expect(reminder.tasks[1]?.kind).toBe('reminder')
    expect(reminder.tasks[1]?.prompt.toLowerCase()).toContain('stretch')
    expect(reminder.tasks[1]?.dueAt).toBe(1_000 + 10 * 60_000)
  })

  it('is wired in main before the Harbor apiKey check', () => {
    const main = readFileSync(join(root, 'src/main/index.ts'), 'utf8')
    const run = main.match(/async function runChat[\s\S]*?\nfunction trayIcon/)?.[0] ?? ''
    expect(run).toContain('handleHabitatTurn')
    expect(run.indexOf('handleHabitatTurn')).toBeLessThan(run.indexOf('settings.apiKey.trim()'))
    expect(run).toContain('habitatClock.replace')
    expect(main).toContain('habitatClock.restore(loadTasks())')
  })
})

describe('operator memory from parsed text', () => {
  it('writes likes, notes, and facts from remember / note / don\'t forget', () => {
    let memory = createMemory()
    memory = ingestOperatorUtterance(memory, 'remember that I like tea')
    expect(memory.likes).toContain('tea')
    memory = ingestOperatorUtterance(memory, 'note that I work nights')
    expect(memory.facts.work).toBe('nights')
    memory = ingestOperatorUtterance(memory, "don't forget the foundry is loud")
    expect(memory.notes.some((note) => note.includes('foundry is loud'))).toBe(true)
    const recall = handleHabitatTurn({
      text: 'what do you remember',
      memory,
      tasks: [],
      now: 0
    })
    expect(recall.handled).toBe(true)
    expect(recall.reply).toMatch(/Operator/)
    expect(recall.reply.toLowerCase()).toContain('tea')
    expect(recall.reply.toLowerCase()).toContain('nights')
    expect(recall.reply.toLowerCase()).toContain('foundry')
    expect(recall.reply.trim().startsWith('{')).toBe(false)
    expect(isClean(recall.reply)).toBe(true)
    const about = handleHabitatTurn({
      text: 'what do you know about me',
      memory,
      tasks: [],
      now: 0
    })
    expect(about.handled).toBe(true)
    expect(about.reply.toLowerCase()).toContain('tea')
    expect(ingestOperatorUtterance(memory, 'what do you remember about me').notes).toEqual(memory.notes)
  })

  it('weaves recall instead of dumping json', () => {
    const memory = ingestOperatorUtterance(createMemory(), 'remember that I like tea')
    const woven = recallSpeech(memory, false)
    expect(woven).not.toContain('"likes"')
    expect(woven).toMatch(/Operator/)
    expect(woven.toLowerCase()).toContain('tea')
  })
})

describe('timer fire path', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('takeDue splits on dueAt and formatFireLine is caption-ready', () => {
    const task: HabitatTask = {
      id: 't1',
      kind: 'timer',
      dueAt: 5_000,
      prompt: 'stretch',
      createdAt: 0
    }
    expect(takeDue([task], 4_999).due).toHaveLength(0)
    expect(takeDue([task], 5_000).due).toEqual([task])
    const line = formatFireLine(task)
    expect(line).toMatch(/Operator/)
    expect(line.toLowerCase()).toContain('stretch')
    expect(isClean(line)).toBe(true)
  })

  it('invokes onFire (speak/caption stand-in) when the mock clock reaches dueAt', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const fired: HabitatTask[] = []
    const clock = createTaskClock({
      now: () => Date.now(),
      setTimeout,
      clearTimeout: (id) => {
        clearTimeout(id as ReturnType<typeof setTimeout>)
      },
      persist: () => undefined,
      onFire: (task) => fired.push(task)
    })
    clock.replace([
      { id: 'a', kind: 'timer', dueAt: 5_000, prompt: 'stretch', createdAt: 0 }
    ])
    expect(fired).toHaveLength(0)
    vi.advanceTimersByTime(4_999)
    expect(fired).toHaveLength(0)
    vi.advanceTimersByTime(1)
    expect(fired).toHaveLength(1)
    expect(fired[0]?.prompt).toBe('stretch')
    expect(formatFireLine(fired[0]!)).toMatch(/Operator/)
    expect(clock.snapshot()).toHaveLength(0)
    const main = readFileSync(join(root, 'src/main/index.ts'), 'utf8')
    expect(main).toContain('formatFireLine')
    expect(main).toContain("sendOverlay('ordis:chunk'")
    expect(main).toContain('captionAndSpeak')
  })

  it('restores overdue timers on ready and fires them', () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    const fired: HabitatTask[] = []
    const clock = createTaskClock({
      now: () => Date.now(),
      setTimeout,
      clearTimeout: (id) => {
        clearTimeout(id as ReturnType<typeof setTimeout>)
      },
      persist: () => undefined,
      onFire: (task) => fired.push(task)
    })
    clock.restore([{ id: 'late', kind: 'reminder', dueAt: 5_000, prompt: 'tea', createdAt: 0 }])
    expect(fired).toHaveLength(1)
    expect(fired[0]?.prompt).toBe('tea')
    expect(clock.snapshot()).toHaveLength(0)
  })

  it('parses relative durations, clock forms, and cancel', () => {
    expect(parseSchedule('set a timer for 90 seconds', 0)?.dueAt).toBe(90_000)
    expect(parseSchedule('in 20 minutes', 0)?.dueAt).toBe(20 * 60_000)
    const now = Date.parse('2026-08-29T02:35:00.000Z')
    const due = nextClockDue(15, 0, now)
    expect(new Date(due).toISOString()).toBe('2026-08-29T22:00:00.000Z')
    const at = parseSchedule('remind me at 3pm to stretch', now)
    expect(at?.kind).toBe('reminder')
    expect(at?.dueAt).toBe(due)
    expect(at?.prompt.toLowerCase()).toContain('stretch')
    const scheduled = handleHabitatTurn({
      text: 'timer 5 minutes',
      memory: createMemory(),
      tasks: [],
      now: 0,
      id: () => 'c1'
    })
    const cancelled = handleHabitatTurn({
      text: 'cancel the timer',
      memory: createMemory(),
      tasks: scheduled.tasks,
      now: 0
    })
    expect(cancelled.handled).toBe(true)
    expect(cancelled.tasks).toHaveLength(0)
    const never = handleHabitatTurn({
      text: 'never mind the reminder',
      memory: createMemory(),
      tasks: [{ id: 'r', kind: 'reminder', dueAt: 9_000, prompt: 'stretch', createdAt: 0 }],
      now: 0
    })
    expect(never.tasks).toHaveLength(0)
    const cap: HabitatTask[] = Array.from({ length: MAX_PENDING_TASKS }, (_, i) => ({
      id: `cap-${i}`,
      kind: 'timer' as const,
      dueAt: 1_000 + i,
      prompt: '',
      createdAt: 0
    }))
    const full = handleHabitatTurn({
      text: 'timer 5 minutes',
      memory: createMemory(),
      tasks: cap,
      now: 0
    })
    expect(full.tasks).toHaveLength(MAX_PENDING_TASKS)
    expect(full.reply.toLowerCase()).toContain('twenty')
  })
})

describe('due reminder playback gate', () => {
  it('wakes and focuses before speak, and refuses click-through speech', () => {
    expect(playbackAllowed({ interactive: false, clickThrough: true })).toBe(false)
    expect(playbackAllowed({ interactive: true, clickThrough: false })).toBe(true)
    expect(reminderFireSteps()).toEqual(['persist', 'due', 'wake-overlay', 'focus-composer', 'speak'])
    const main = readFileSync(join(root, 'src/main/index.ts'), 'utf8')
    const fireAt = main.indexOf('onFire:')
    const speakAt = main.indexOf('captionAndSpeak(formatFireLine')
    const wakeAt = main.indexOf('setInteractive(true, { skipGreeting: true })')
    expect(wakeAt).toBeGreaterThan(fireAt)
    expect(speakAt).toBeGreaterThan(wakeAt)
    expect(main).toContain('overlay is click-through')
    expect(main).toContain('startOsPlayback')
    const speak = main.match(/function speak\(text: string\): void \{[\s\S]*?\n\}/)?.[0] ?? main
    expect(speak).toContain('if (!interactive)')
    expect(main).not.toMatch(/speak\(idleChatter/)
    expect(main).not.toMatch(/\bidleChatter\s*\(/)
    const overlay = readFileSync(join(root, 'src/renderer/src/overlay.ts'), 'utf8')
    expect(overlay).toContain('promptInput.focus')
    const store = readFileSync(join(root, 'src/main/store.ts'), 'utf8')
    expect(store).toContain('tasks.json')
    expect(store).toContain('memory.json')
    expect(overlay).not.toContain('tasks.json')
    expect(overlay).not.toContain('memory.json')
    expect(overlay).not.toMatch(/localStorage/)
  })
})
