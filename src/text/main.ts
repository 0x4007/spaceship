import "@fontsource-variable/jetbrains-mono/wght.css"
import { prepareWithSegments, type PreparedTextWithSegments } from "@chenglou/pretext"
import { $ } from "../dom.ts"
import { centeredAt, type Point } from "../point.ts"
import { createAttentionKnobs } from "./attention-knobs.ts"
import { createConnections } from "./connections.ts"
import { caretAt, isAhead, pointAt, type Caret, type TextMetrics } from "./caret.ts"
import { simulatedSource } from "./completion.ts"
import { makeDraggable } from "./drag.ts"
import { createFutureKnobs } from "./future-knobs.ts"
import { onPressAndHold } from "./hold.ts"
import { createKeywordRelevance } from "./keyword-relevance.ts"
import { layoutLines } from "./layout.ts"
import { createLeftRail } from "./left-rail.ts"
import { circleOf } from "./links.ts"
import { liveAttention } from "./live-attention.ts"
import { liveSource } from "./live-completion.ts"
import { liveDimension } from "./live-dimension.ts"
import { liveInfluence } from "./live-influence.ts"
import { liveRealization } from "./live-realization.ts"
import { liveRelevance } from "./live-relevance.ts"
import { simulatedAttention } from "./simulated-attention.ts"
import { simulatedDimension } from "./simulated-dimension.ts"
import { simulatedInfluence } from "./simulated-influence.ts"
import { simulatedRealization } from "./simulated-realization.ts"
import { simulatedRelevance } from "./simulated-relevance.ts"
import { isSoundOn, setSoundOn, startSound, type Sound } from "./sound/engine.ts"
import { sounds } from "./sound/sounds.ts"
import { showStatus } from "./status-line.ts"
import { storyLayoutOf, type StoryLayout } from "./story-layout.ts"
import { createTextStream, type Steering } from "./text-stream.ts"
import type { Span } from "./segments.ts"
import { countWords } from "./words.ts"

const DWELL_MS = 300
/** Generated words kept ready past the knob: whenever fewer remain, the stream continues the text, appending, never rewriting. */
const BUFFER_WORDS = 300
/** A top-up that adds no words (the source failed or said nothing) is retried after this long, doubling each time up to `MAX_RETRY_MS`. */
const RETRY_MS = 1000
const MAX_RETRY_MS = 16000
/** Double click and hold: the second press, if it starts within `DOUBLE_PRESS_MS` of the first and is held still, opens the fan menu after 100 ms plus this sweep (500 ms in all). */
const HOLD_MS = 400
const DOUBLE_PRESS_MS = 400
/** Between the rail and the text column. */
const RAIL_GAP_PX = 12
/** Drag speed, in px per ms, at which the word tick is softest. */
const DRAG_SPEED_FULL = 1.2

const element = $("#text")
const handle = $<HTMLButtonElement>("#pointer")
const statusElement = $("#status")
const soundToggle = $<HTMLButtonElement>("#sound-toggle")
const railElement = $("#rail")
const style = getComputedStyle(element)
await document.fonts.load(style.font)
/** Measures where the first hidden word on the caret's line starts, in the text's font. */
const measure = document.createElement("canvas").getContext("2d")!
measure.font = style.font

const isLive = new URLSearchParams(location.search).get("live") === "true"
const stream = createTextStream(isLive ? liveSource : simulatedSource, render)
const rail = createLeftRail(railElement)
const connections = createConnections({ source: isLive ? liveInfluence : simulatedInfluence, onChange: refreshRail })
const relevance = createKeywordRelevance(isLive ? liveRelevance : simulatedRelevance, refreshRail)
const attention = createAttentionKnobs({
  source: isLive ? liveAttention : simulatedAttention,
  textElement: element,
  knob: handle,
  linkPath: $<SVGPathElement>("#attention-links"),
  activeLinkPath: $<SVGPathElement>("#attention-active-link"),
  isPastEnd: (point) => isAhead(caretAt(point, metricsOf()), caret),
  onChange: invalidateFuture,
  onHover: (phrase) => {
    connections.focusPhrase(phrase)
    refreshRail()
  },
  onPaint: refreshRail,
})
const futureKnobs = createFutureKnobs({
  template: $<HTMLTemplateElement>("#future-knob"),
  mainKnob: handle,
  linkPath: $<SVGPathElement>("#future-links"),
  tunedLinkPath: $<SVGPathElement>("#future-tuned-link"),
  hud: $<SVGGElement>("#future-hud"),
  source: isLive ? liveDimension : simulatedDimension,
  realization: isLive ? liveRealization : simulatedRealization,
  textElement: element,
  context: () => ({ text: shownText, leads: attention.leads() }),
  onChange: invalidateFuture,
})
let caret: Caret = { line: 0, x: 0 }
let shownText = ""
let story: StoryLayout = { content: "", text: "", combined: "", sentences: [] }
let railFrame: number | undefined
let shownCount: number | undefined
/** Words shown where the knob last rested; where it rests next is compared with this, so only a real move back discards text, not a path that crossed words. */
let restCount = 0
let restTimer: number | undefined
/** The lines shown, as of the last render. */
let shownLines: string[] = []
let dwellTimer: number | undefined
/** Counts dwells, so requests deferred by an older one are dropped. */
let dwellCount = 0
let topUpTimer: number | undefined
let retryAt = 0
let retryMs = RETRY_MS
let isFutureStale = false
let prepared: { text: string; layout: PreparedTextWithSegments } | undefined
let holdSound: Sound | undefined
/** Whether the current press opened the fan menu, so its double click does not also expand or collapse. */
let didHold = false
/** The previous drag point, for how fast the knob moves. */
let lastDrag: { point: Point; at: number } | undefined

startSound()
showSoundToggle()
soundToggle.addEventListener("click", () => {
  setSoundOn(!isSoundOn())
  showSoundToggle()
})

// A quick double click expands or collapses; one whose second press was held opened the fan menu instead.
handle.addEventListener("dblclick", () => (didHold ? (didHold = false) : detachAllOrExpand()))
handle.addEventListener("pointerenter", ({ buttons, pageX }) => buttons || sounds.knobHover(pageX))
handle.addEventListener("pointerdown", ({ pageX }) => {
  didHold = false
  sounds.knobGrab(pageX)
})
onPressAndHold(
  handle,
  HOLD_MS,
  ({ pageX, pageY, pointerId }) => {
    didHold = true
    futureKnobs.spawn({ x: pageX, y: pageY }, pointerId)
  },
  {
    onSweep: () => (holdSound = sounds.holdSweep(circleOf(handle).center.x, HOLD_MS / 1000)),
    onSweepEnd: (completed) => completed || holdSound?.stop(),
    secondPressWithin: DOUBLE_PRESS_MS,
  },
)
// Dragging scrubs at once, forward or back.
makeDraggable(handle, {
  onDrag: (point) => {
    handle.toggleAttribute("data-dragging", true)
    const before = shownCount
    moveTo(point)
    soundWordsCrossed(before, point)
  },
  onDrop: () => {
    if (handle.hasAttribute("data-dragging")) sounds.knobRelease(circleOf(handle).center.x)
    handle.removeAttribute("data-dragging")
    lastDrag = undefined
  },
})

addEventListener("resize", () => moveTo(pointAt(caret, metricsOf())))
moveTo(pointAt(caret, metricsOf()))

/** The knob stops at the column's right edge, as no line reaches past it. */
function moveTo({ x, y }: Point) {
  const { left, width } = element.getBoundingClientRect()
  const point = { x: Math.min(x, left + scrollX + width), y }
  caret = caretAt(point, metricsOf())
  handle.style.translate = centeredAt(point, handle.offsetWidth)
  render()
  restartRest()
}

/** The knob rests once it has not moved for `DWELL_MS`, however slowly it crossed words before; only then may a move back discard text. */
function restartRest() {
  clearTimeout(restTimer)
  restTimer = setTimeout(() => {
    discardIfRestingBack()
    topUp()
  }, DWELL_MS)
}

function detachAllOrExpand() {
  if (!attention.isExpanded() && !futureKnobs.count()) return revealAttention()
  sounds.collapse(circleOf(handle).center.x)
  attention.collapse()
  futureKnobs.clear()
}

/** The continuation generated alongside the prefetched boxes was not led by them, so it is replaced as soon as they are all shown. */
async function revealAttention() {
  await attention.expand()
  regenerateFuture()
  afterStreaming(futureKnobs.preload)
}

function render() {
  /** Unrounded, unlike `clientWidth`: a line that fills the column exactly measures a hair wider than the rounded width. */
  const lines = layoutLines(prepareWords(), caret, element.getBoundingClientRect().width)
  const text = lines.join(" ")
  const count = countWords(text)

  if (count !== shownCount) restartDwell()
  shownCount = count
  shownLines = lines
  scheduleTopUp()
  story = storyLayoutOf(lines, stream.text)
  if (element.textContent !== story.content) element.textContent = story.content
  connections.update(story)
  shownText = text
  attention.update(text)
  futureKnobs.follow(story)
  report()
}

/**
 * Moving the knob back hides words at once, but whether the text past it is discarded is decided only where the knob comes to rest, never along its path:
 * a drag toward the bottom left enters each line far right and crosses it leftward, hiding words it just revealed, yet rests further on than it started.
 * The text is discarded if the knob rests behind where it last rested, past a safe zone of one word (it must be left of that word's start, or back more than one word).
 */
function discardIfRestingBack() {
  const count = shownCount ?? 0
  const behind = restCount - count
  if (behind > 1 || (behind === 1 && !isOverHiddenWord(shownLines))) stream.truncate(count)
  restCount = count
}

/** Whether the caret is past the start of the first word its line does not show, so it has not cleared that word. */
function isOverHiddenWord(lines: string[]) {
  if (caret.line > lines.length) return false
  // The caret's line has no entry while it shows no words yet: its first hidden word starts at the line's left edge.
  const shown = lines[caret.line] ?? ""
  const hiddenWordStart = shown ? measure.measureText(`${shown} `).width : 0
  return caret.x > hiddenWordStart
}

/** The text after the knob was steered by the previous boxes and future knobs, so it is regenerated once they settle. */
function invalidateFuture() {
  refreshRail()
  isFutureStale = true
  restartDwell()
  report()
}

/** Shows whether the model is generating, on the knob and in the status line, with what the text holds and is steered by. */
function report() {
  const activity = stream.activity()
  handle.toggleAttribute("data-generating", activity.isGenerating)
  showStatus(statusElement, {
    ...activity,
    words: shownCount ?? 0,
    buffer: Math.max(0, countWords(stream.text) - (shownCount ?? 0)),
    boxes: attention.leads().length,
    steering: futureKnobs.controls().length,
    pinned: futureKnobs.pinnedCount(),
  })
}

function restartDwell() {
  clearTimeout(dwellTimer)
  const dwell = ++dwellCount
  dwellTimer = setTimeout(() => {
    if (isFutureStale) regenerateFuture()
    else topUp()
    afterStreaming(() => {
      if (dwell !== dwellCount) return
      attention.prefetch()
      futureKnobs.preload()
    })
  }, DWELL_MS)
}

/**
 * Runs `request` once the continuation is streaming. Keyword highlights and future knob menus share the text API's rate limit,
 * and the continuation is what the reader waits for, so it is always asked first.
 */
function afterStreaming(request: () => void) {
  stream.streaming().then(request)
}

function regenerateFuture() {
  isFutureStale = false
  restCount = shownCount ?? 0
  stream.regenerate(shownCount ?? 0, "steering changed", steering())
}

function steering(): Steering {
  return { leads: attention.leads(), controls: futureKnobs.controls() }
}

/**
 * Keeps at least `BUFFER_WORDS` generated words past the knob, continuing the text from its end whenever fewer remain.
 * Asked after every change, but run on the next task, after a finished generation has reported how it went.
 */
function scheduleTopUp() {
  topUpTimer ??= setTimeout(() => {
    topUpTimer = undefined
    topUp()
  })
}

function topUp() {
  if (stream.activity().isGenerating || performance.now() < retryAt) return
  const words = countWords(stream.text)
  if (words - (shownCount ?? 0) >= BUFFER_WORDS) return
  stream.generate("buffer low", steering()).then(
    (outcome) => outcome === "done" && settleTopUp(words),
    (error) => (console.error(error), settleTopUp(words)),
  )
}

/** A top-up that added words resets the retry delay; one that added none waits before trying again, longer each time. */
function settleTopUp(wordsBefore: number) {
  if (countWords(stream.text) > wordsBefore) {
    retryMs = RETRY_MS
    retryAt = 0
    return scheduleTopUp()
  }
  retryAt = performance.now() + retryMs
  setTimeout(scheduleTopUp, retryMs)
  retryMs = Math.min(retryMs * 2, MAX_RETRY_MS)
}

function prepareWords() {
  const text = stream.text
  if (prepared?.text !== text) prepared = { text, layout: prepareWithSegments(text, style.font) }
  return prepared.layout
}

/** Redraws the rail beside the text once per frame, however many changes ask for it. */
function refreshRail() {
  railFrame ??= requestAnimationFrame(() => {
    railFrame = undefined
    const leads = attention.leads()
    relevance.update(story, leads)
    const { left, top } = element.getBoundingClientRect()
    railElement.style.translate = `${left + scrollX - railElement.offsetWidth - RAIL_GAP_PX}px ${top + scrollY + parseFloat(style.paddingTop)}px`
    rail.show({
      lines: lineSpansOf(story.content),
      boxes: attention.spans().map((spans, i) => ({ ...spans, ...relevance.relevanceOf(leads[i]) })),
      connection: connections.current(),
    })
  })
}

/** Each line's span of the text, where lines are joined by single spaces. */
function lineSpansOf(content: string): Span[] {
  let start = 0
  return content.split("\n").map((line) => {
    const span = { start, end: start + line.length }
    start = span.end + 1
    return span
  })
}

/** Ticks once per word the dragged knob reveals or removes; words arriving from the generator are silent. */
function soundWordsCrossed(before: number | undefined, point: Point) {
  const now = performance.now()
  const speed = lastDrag ? Math.hypot(point.x - lastDrag.point.x, point.y - lastDrag.point.y) / Math.max(1, now - lastDrag.at) / DRAG_SPEED_FULL : 0
  lastDrag = { point, at: now }
  if (before !== undefined && shownCount !== undefined && shownCount !== before)
    sounds.word(Math.sign(shownCount - before), Math.abs(shownCount - before), speed, point.x)
}

function showSoundToggle() {
  const isOn = isSoundOn()
  soundToggle.setAttribute("aria-pressed", `${isOn}`)
  soundToggle.querySelector("b")!.textContent = isOn ? "on" : "off"
}

/** Read on every use, since the centered column moves with the window. */
function metricsOf(): TextMetrics {
  const { left, top } = element.getBoundingClientRect()
  return { left: left + scrollX, top: top + scrollY + parseFloat(style.paddingTop), lineHeight: parseFloat(style.lineHeight) }
}
