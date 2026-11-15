import "@fontsource-variable/jetbrains-mono/wght.css"
import { prepareWithSegments, type PreparedTextWithSegments } from "@chenglou/pretext"
import { $ } from "../dom.ts"
import { centeredAt, type Point } from "../point.ts"
import { createAttentionKnobs } from "./attention-knobs.ts"
import { caretAt, isAhead, pointAt, type Caret, type TextMetrics } from "./caret.ts"
import { simulatedSource } from "./completion.ts"
import { makeDraggable } from "./drag.ts"
import { createFutureKnobs } from "./future-knobs.ts"
import { onPressAndHold } from "./hold.ts"
import { layoutLines } from "./layout.ts"
import { circleOf } from "./links.ts"
import { liveAttention } from "./live-attention.ts"
import { liveSource } from "./live-completion.ts"
import { liveDimension } from "./live-dimension.ts"
import { liveInfluence } from "./live-influence.ts"
import { liveRealization } from "./live-realization.ts"
import { createSentenceInfluence } from "./sentence-influence.ts"
import { simulatedAttention } from "./simulated-attention.ts"
import { simulatedDimension } from "./simulated-dimension.ts"
import { simulatedInfluence } from "./simulated-influence.ts"
import { simulatedRealization } from "./simulated-realization.ts"
import { isSoundOn, setSoundOn, startSound, type Sound } from "./sound/engine.ts"
import { sounds } from "./sound/sounds.ts"
import { showStatus } from "./status-line.ts"
import { storyLayoutOf } from "./story-layout.ts"
import { createTextStream, type GenerationTrigger, type Steering } from "./text-stream.ts"
import { countWords } from "./words.ts"

const DWELL_MS = 300
const HOLD_MS = 250
/** Drag speed, in px per ms, at which the word tick is softest. */
const DRAG_SPEED_FULL = 1.2

const element = $("#text")
const handle = $<HTMLButtonElement>("#pointer")
const statusElement = $("#status")
const soundToggle = $<HTMLButtonElement>("#sound-toggle")
const style = getComputedStyle(element)
await document.fonts.load(style.font)

const isLive = new URLSearchParams(location.search).get("live") === "true"
const stream = createTextStream(isLive ? liveSource : simulatedSource, render)
const sentences = createSentenceInfluence({ source: isLive ? liveInfluence : simulatedInfluence, textElement: element, knob: handle })
const attention = createAttentionKnobs({
  source: isLive ? liveAttention : simulatedAttention,
  textElement: element,
  knob: handle,
  linkPath: $<SVGPathElement>("#attention-links"),
  activeLinkPath: $<SVGPathElement>("#attention-active-link"),
  isPastEnd: (point) => isAhead(caretAt(point, metricsOf()), caret),
  onChange: invalidateFuture,
  onHover: sentences.focusPhrase,
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
let shownCount: number | undefined
let dwellTimer: number | undefined
let isFutureStale = false
let prepared: { text: string; layout: PreparedTextWithSegments } | undefined
let holdSound: Sound | undefined
/** The previous drag point, for how fast the knob moves. */
let lastDrag: { point: Point; at: number } | undefined

startSound()
showSoundToggle()
soundToggle.addEventListener("click", () => {
  setSoundOn(!isSoundOn())
  showSoundToggle()
})

handle.addEventListener("dblclick", detachAllOrExpand)
handle.addEventListener("pointerenter", ({ buttons, pageX }) => buttons || sounds.knobHover(pageX))
handle.addEventListener("pointerdown", ({ pageX }) => sounds.knobGrab(pageX))
const hold = onPressAndHold(handle, HOLD_MS, ({ pageX, pageY, pointerId }) => futureKnobs.spawn({ x: pageX, y: pageY }, pointerId), {
  onSweep: () => (holdSound = sounds.holdSweep(circleOf(handle).center.x)),
  onSweepEnd: (completed) => completed || holdSound?.stop(),
})
makeDraggable(handle, {
  onDrag: (point) => {
    if (hold.hasSweepStarted()) return
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
  const previous = caret
  caret = caretAt(point, metricsOf())
  handle.style.translate = centeredAt(point, handle.offsetWidth)
  render()
  if (isAhead(caret, previous)) generateAtEndOfText("pointer moved right")
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
  futureKnobs.preload()
}

function render() {
  /** Unrounded, unlike `clientWidth`: a line that fills the column exactly measures a hair wider than the rounded width. */
  const lines = layoutLines(prepareWords(), caret, element.getBoundingClientRect().width)
  const text = lines.join(" ")
  const count = countWords(text)

  if (shownCount !== undefined && count < shownCount) stream.truncate(count)
  if (count !== shownCount) restartDwell()
  shownCount = count
  const story = storyLayoutOf(lines, stream.text)
  sentences.update(story)
  shownText = text
  attention.update(text)
  futureKnobs.follow(story)
  report()
}

/** The text after the knob was steered by the previous boxes and future knobs, so it is regenerated once they settle. */
function invalidateFuture() {
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
    boxes: attention.leads().length,
    steering: futureKnobs.controls().length,
    pinned: futureKnobs.pinnedCount(),
  })
}

function restartDwell() {
  clearTimeout(dwellTimer)
  dwellTimer = setTimeout(() => {
    attention.prefetch()
    futureKnobs.preload()
    if (isFutureStale) regenerateFuture()
    else generateAtEndOfText("dwell timer")
  }, DWELL_MS)
}

function regenerateFuture() {
  isFutureStale = false
  stream.regenerate(shownCount ?? 0, "steering changed", steering())
}

function steering(): Steering {
  return { leads: attention.leads(), controls: futureKnobs.controls() }
}

function generateAtEndOfText(trigger: GenerationTrigger) {
  if (shownCount === countWords(stream.text)) stream.generate(trigger, steering())
}

function prepareWords() {
  const text = stream.text
  if (prepared?.text !== text) prepared = { text, layout: prepareWithSegments(text, style.font) }
  return prepared.layout
}

/** Ticks as the dragged knob reveals or removes words; words arriving from the generator are silent. */
function soundWordsCrossed(before: number | undefined, point: Point) {
  const now = performance.now()
  const speed = lastDrag ? Math.hypot(point.x - lastDrag.point.x, point.y - lastDrag.point.y) / Math.max(1, now - lastDrag.at) / DRAG_SPEED_FULL : 0
  lastDrag = { point, at: now }
  if (before !== undefined && shownCount !== undefined && shownCount !== before) sounds.word(Math.sign(shownCount - before), speed, point.x)
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
