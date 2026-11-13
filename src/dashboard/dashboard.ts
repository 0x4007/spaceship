import type { AskRun } from "../chat/ask.ts"
import { $, $$ } from "../dom.ts"
import { FINGERS } from "../fingers.ts"
import { SHAKE_REVERSALS } from "../gesture/shake.ts"
import { WIPE_MAX_ROLL_SPREAD_DEGREES, WIPE_REVERSALS } from "../gesture/wipe.ts"
import { ACTING_HAND } from "../hands.ts"
import { PINCH_OFF_THRESHOLD, PINCH_ON_THRESHOLD, type Pinch } from "../interaction/pinch.ts"
import { PULL_OUT_SPEED } from "../interaction/pull-speed.ts"
import { activeVoiceCount, isSoundEnabled } from "../sound/engine.ts"
import type { SpeechReading } from "../voice/voice-input.ts"
import { setMarquee, setTicker } from "./marquee.ts"
import { log, onLog, type LogEntry } from "./log.ts"
import { createScope } from "./scope.ts"

const LOG_LIMIT = 80
const FRAME_STATUS_PREFIX = "hands:"
const FRAME_SMOOTHING = 0.1
const RATE_SMOOTHING = 0.3
const RATE_SCALE = { min: 0, max: 8000 }
const WORDS_SCALE = { min: 0, max: 30 }
const PREVIEW_CHARS = 200
const HAND_SCOPES = {
  pinch: { min: 0, max: 1, thresholds: [PINCH_OFF_THRESHOLD, PINCH_ON_THRESHOLD] },
  openness: { min: 0, max: 1 },
  roll: { min: -180, max: 180 },
  speed: { min: -1, max: 1.5, thresholds: [PULL_OUT_SPEED] },
}

export type Readings = {
  pinching: Map<string, Pinch>
  openness: Map<string, number>
  roll: Map<string, number>
  indexInPalm: Map<string, boolean>
  pulls: Map<string, { speed: number; reach: number }>
  shakes: Map<string, number>
  wipes: Map<string, { reversals: number; rollSpread: number } | undefined>
  hands: number
  links: number
  placed: number
  slots: (string | undefined)[]
  llm: AskRun
  speech: Map<string, SpeechReading>
}

type HandPanel = ReturnType<typeof bindHandPanel>
type SpeechPanel = ReturnType<typeof bindSpeechPanel>
type Stream = { chars: number; at: number; rate: number }

export function createDashboard(status: HTMLOutputElement) {
  const panels = $$<HTMLElement>("#dashboard article[data-hand]").map(bindHandPanel)
  const speechPanels = $$<HTMLElement>("#dashboard article[data-speaker]").map(bindSpeechPanel)
  const llmScope = createScope($<HTMLCanvasElement>('[aria-labelledby="dashboard-llm"] canvas'), RATE_SCALE)
  const frame = { last: 0, interval: 0 }
  const stream: Stream = { chars: 0, at: 0, rate: 0 }

  showLimits()
  bindLog(status)

  return {
    update(readings: Readings, now: number) {
      frame.interval = frame.last ? frame.interval + (now - frame.last - frame.interval) * FRAME_SMOOTHING : 0
      frame.last = now

      panels.forEach((panel) => showHand(panel, readings))
      showLlm(readings.llm, stream, llmScope, now)
      speechPanels.forEach((panel) => showSpeech(panel, readings.speech))
      showBoard(readings)
      showGestures(readings)
      showSystem(readings, frame.interval)
    },
  }
}

function bindHandPanel(panel: HTMLElement) {
  const hand = panel.dataset.hand!
  const field = (name: string) => panel.querySelector<HTMLOutputElement>(`[data-field=${name}]`)!
  const scopes = Object.entries(HAND_SCOPES).map(
    ([signal, scale]) => [signal, createScope(panel.querySelector<HTMLCanvasElement>(`[data-signal=${signal}]`)!, scale)] as const,
  )

  panel.querySelector("[data-role]")!.textContent = hand === ACTING_HAND ? "acting" : "display"

  return { hand, field, scopes: Object.fromEntries(scopes) }
}

function bindSpeechPanel(panel: HTMLElement) {
  const speaker = panel.dataset.speaker!
  const field = (name: string) => panel.querySelector<HTMLOutputElement>(`[data-field=${name}]`)!

  panel.querySelector("[data-role]")!.textContent = speaker === ACTING_HAND ? "question" : "listen"

  return { speaker, field, scope: createScope(panel.querySelector<HTMLCanvasElement>("canvas")!, WORDS_SCALE) }
}

function showLlm(run: AskRun, stream: Stream, scope: ReturnType<typeof createScope>, now: number) {
  const field = (name: string) => $<HTMLOutputElement>(`[aria-labelledby="dashboard-llm"] [data-field=${name}]`)
  const active = run.phase === "asking" || run.phase === "streaming"
  const seconds = (from: number, to: number) => `${((to - from) / 1000).toFixed(1)}s`

  stream.rate = active ? stream.rate + (((run.text.length - stream.chars) / Math.max(now - stream.at, 1)) * 1000 - stream.rate) * RATE_SMOOTHING : 0
  stream.chars = run.text.length
  stream.at = now
  scope.push(run.phase === "idle" ? undefined : stream.rate)

  setField(field("phase"), run.phase, active, active)
  setField(field("first"), run.firstItemAt ? seconds(run.startedAt, run.firstItemAt) : "—")
  setField(field("elapsed"), run.startedAt ? seconds(run.startedAt, run.endedAt ?? now) : "—")
  setField(field("items"), run.startedAt ? String(run.items) : "—")
  setField(field("chars"), run.startedAt ? String(run.text.length) : "—")
  setField(field("rate"), active ? `${stream.rate.toFixed(0)}/s` : "—")
  setField(field("question"), run.question || "—")
  setTicker(field("preview"), run.text.slice(-PREVIEW_CHARS).replace(/\s+/g, " ") || "—")
}

function showSpeech({ speaker, field, scope }: SpeechPanel, speech: Map<string, SpeechReading>) {
  const reading = speech.get(speaker)
  const words = reading?.partial.split(/\s+/).filter(Boolean).length

  scope.push(reading?.listening ? words : undefined)

  setField(field("state"), reading?.listening ? "listening" : reading?.failed ? "error" : "idle", reading?.listening, reading?.listening)
  if (reading?.listening) setTicker(field("text"), reading.partial || "…")
  else setField(field("text"), reading?.transcript || "—")
}

function showBoard({ slots, placed, links }: Readings) {
  const slot = (name: string) => $<HTMLOutputElement>(`[data-slot=${name}]`)
  const field = (name: string) => $<HTMLOutputElement>(`[aria-labelledby="dashboard-board"] [data-field=${name}]`)

  FINGERS.forEach((finger, index) => setField(slot(finger), slots[index] ?? "—", slots[index] !== undefined))
  setField(field("placed"), String(placed), placed > 0)
  setField(field("links"), String(links), links > 0)
}

function showHand({ hand, field, scopes }: HandPanel, { pinching, openness, roll, indexInPalm, pulls }: Readings) {
  const pinch = pinching.get(hand)
  const pull = pulls.get(hand)
  const palm = indexInPalm.get(hand)

  scopes.pinch.push(pinch?.confidence)
  scopes.openness.push(openness.get(hand))
  scopes.roll.push(roll.get(hand))
  scopes.speed.push(pull?.speed)

  setField(field("pinch"), pinch ? `${pinch.confidence.toFixed(2)} ${pinch.active ? "on" : "off"}` : "—", pinch?.active)
  setField(field("openness"), openness.get(hand)?.toFixed(2) ?? "—")
  setField(field("roll"), roll.has(hand) ? `${roll.get(hand)!.toFixed(0)}°` : "—")
  setField(field("speed"), pull ? `${pull.speed.toFixed(2)}/s` : "—", pull !== undefined && pull.speed >= PULL_OUT_SPEED)
  setField(field("palm"), palm === undefined ? "—" : palm ? "yes" : "no", palm)
}

function showGestures({ shakes, wipes }: Readings) {
  $$<HTMLTableCellElement>("#dashboard [data-gesture] [data-hand]").forEach((cell) => {
    const hand = cell.dataset.hand!
    const gesture = cell.parentElement!.dataset.gesture
    const shake = shakes.get(hand)
    const wipe = wipes.get(hand)

    if (gesture === "shake") setField(cell, shake === undefined ? "—" : `${shake}/${SHAKE_REVERSALS}`, shake !== undefined && shake > 0)
    if (gesture === "wipe") setField(cell, wipe ? `${wipe.reversals}/${WIPE_REVERSALS}` : "—", !!wipe && wipe.reversals > 0)
    if (gesture === "spread") setField(cell, wipe ? `${wipe.rollSpread.toFixed(0)}°` : "—", !!wipe && wipe.rollSpread <= WIPE_MAX_ROLL_SPREAD_DEGREES)
  })
}

function showSystem({ hands }: Readings, interval: number) {
  const system = (name: string) => $<HTMLOutputElement>(`[data-system=${name}]`)

  setField(system("fps"), interval ? (1000 / interval).toFixed(0) : "—")
  setField(system("frame"), interval ? `${interval.toFixed(0)} ms` : "—")
  setField(system("hands"), String(hands))
  setField(system("voices"), String(activeVoiceCount()), activeVoiceCount() > 0)
  setField(system("sound"), isSoundEnabled() ? "on" : "off", isSoundEnabled())
}

function showLimits() {
  const limits = {
    shake: `${SHAKE_REVERSALS} reversals`,
    wipe: `${WIPE_REVERSALS} reversals`,
    spread: `≤ ${WIPE_MAX_ROLL_SPREAD_DEGREES}°`,
  }

  Object.entries(limits).forEach(([gesture, text]) => ($(`[data-gesture=${gesture}] [data-field=limit]`).textContent = text))
}

function bindLog(status: HTMLOutputElement) {
  const list = $<HTMLOListElement>("#event-log")
  const template = $<HTMLTemplateElement>("#log-entry")
  let lastStatus = ""

  onLog(appendEntry)
  new MutationObserver(() => {
    const text = status.value

    if (text === lastStatus || text.startsWith(FRAME_STATUS_PREFIX)) return

    lastStatus = text
    log("status", text)
  }).observe(status, { childList: true, characterData: true, subtree: true })

  function appendEntry({ at, event, detail }: LogEntry) {
    const item = template.content.cloneNode(true) as DocumentFragment

    item.querySelector("time")!.textContent = `${(at / 1000).toFixed(1)}s`
    item.querySelector("strong")!.textContent = event
    const span = item.querySelector("span")!

    list.prepend(item)
    setMarquee(span, detail)
    while (list.children.length > LOG_LIMIT) list.lastElementChild!.remove()
  }
}

function setField(element: HTMLElement, text: string, active?: boolean, pulse?: boolean) {
  if (element.hasAttribute("data-marquee")) setMarquee(element, text)
  else if (element.textContent !== text) element.textContent = text

  const state = active ? "true" : "false"

  if (element.dataset.active !== state) element.dataset.active = state
  if (pulse !== undefined && (element.dataset.pulse === "true") !== pulse) element.dataset.pulse = String(pulse)
}
