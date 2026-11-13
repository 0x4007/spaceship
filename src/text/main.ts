import { prepareWithSegments, type PreparedTextWithSegments } from "@chenglou/pretext"
import { $ } from "../dom.ts"
import { centeredAt, type Point } from "../point.ts"
import { createAttentionKnobs } from "./attention-knobs.ts"
import { caretAt, isAhead, type TextMetrics } from "./caret.ts"
import { simulatedSource } from "./completion.ts"
import { makeDraggable } from "./drag.ts"
import { createFutureKnobs } from "./future-knobs.ts"
import { onPressAndHold } from "./hold.ts"
import { layoutLines } from "./layout.ts"
import { liveAttention } from "./live-attention.ts"
import { liveSource } from "./live-completion.ts"
import { liveDimension } from "./live-dimension.ts"
import { simulatedAttention } from "./simulated-attention.ts"
import { simulatedDimension } from "./simulated-dimension.ts"
import { createTextStream, type GenerationTrigger, type Steering } from "./text-stream.ts"
import { countWords } from "./words.ts"

const DWELL_MS = 300
const HOLD_MS = 250

const element = $("#text")
const handle = $<HTMLButtonElement>("#pointer")
const style = getComputedStyle(element)
const metrics: TextMetrics = { padding: parseFloat(style.paddingLeft), lineHeight: parseFloat(style.lineHeight) }
const start: Point = { x: metrics.padding, y: metrics.padding + metrics.lineHeight / 2 }

const isLive = new URLSearchParams(location.search).get("live") === "true"
const stream = createTextStream(isLive ? liveSource : simulatedSource, render)
const attention = createAttentionKnobs({
  source: isLive ? liveAttention : simulatedAttention,
  textElement: element,
  knob: handle,
  linkPath: $<SVGPathElement>("#attention-links"),
  isPastEnd: (point) => isAhead(caretAt(point, metrics), caret),
  onChange: invalidateFuture,
})
const futureKnobs = createFutureKnobs({
  template: $<HTMLTemplateElement>("#future-knob"),
  mainKnob: handle,
  linkPath: $<SVGPathElement>("#future-links"),
  tunedLinkPath: $<SVGPathElement>("#future-tuned-link"),
  hud: $<SVGGElement>("#future-hud"),
  source: isLive ? liveDimension : simulatedDimension,
  context: () => ({ text: shownText, leads: attention.leads() }),
  onChange: invalidateFuture,
})
let caret = caretAt(start, metrics)
let shownText = ""
let shownCount: number | undefined
let dwellTimer: number | undefined
let isFutureStale = false
let prepared: { text: string; layout: PreparedTextWithSegments } | undefined

handle.addEventListener("dblclick", detachAllOrExpand)
const hold = onPressAndHold(handle, HOLD_MS, ({ pageX, pageY, pointerId }) => futureKnobs.spawn({ x: pageX, y: pageY }, pointerId))
makeDraggable(handle, {
  onDrag: (point) => {
    if (!hold.hasSweepStarted()) moveTo(point)
  },
})

moveTo(start)

function moveTo(point: Point) {
  const previous = caret
  caret = caretAt(point, metrics)
  handle.style.translate = centeredAt(point, handle.offsetWidth)
  render()
  futureKnobs.layout()
  if (isAhead(caret, previous)) generateAtEndOfText("pointer moved right")
}

function detachAllOrExpand() {
  if (!attention.isExpanded() && !futureKnobs.count()) return revealAttention()
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
  const lines = layoutLines(prepareWords(), caret, document.documentElement.clientWidth - metrics.padding * 2)
  const text = lines.join(" ")
  const count = countWords(text)

  if (shownCount !== undefined && count < shownCount) stream.truncate(count)
  if (count !== shownCount) restartDwell()
  shownCount = count
  const content = lines.join("\n")
  if (element.textContent !== content) element.textContent = content
  shownText = text
  attention.update(text)
}

/** The text after the knob was steered by the previous boxes and future knobs, so it is regenerated once they settle. */
function invalidateFuture() {
  isFutureStale = true
  restartDwell()
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
