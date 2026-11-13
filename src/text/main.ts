import { prepareWithSegments, type PreparedTextWithSegments } from "@chenglou/pretext"
import { $ } from "../dom.ts"
import { centeredAt, type Point } from "../point.ts"
import { createAttentionKnobs } from "./attention-knobs.ts"
import { caretAt, isAhead, type TextMetrics } from "./caret.ts"
import { simulatedSource } from "./completion.ts"
import { makeDraggable } from "./drag.ts"
import { onPressAndHold } from "./hold.ts"
import { layoutLines } from "./layout.ts"
import { liveSource } from "./live-completion.ts"
import { simulatedAttention } from "./simulated-attention.ts"
import { createTextStream, type GenerationTrigger } from "./text-stream.ts"
import { countWords } from "./words.ts"

const DWELL_MS = 100
const HOLD_MS = 500

const element = $("#text")
const handle = $<HTMLButtonElement>("#pointer")
const style = getComputedStyle(element)
const metrics: TextMetrics = { padding: parseFloat(style.paddingLeft), lineHeight: parseFloat(style.lineHeight) }
const start: Point = { x: metrics.padding, y: metrics.padding + metrics.lineHeight / 2 }

const isLive = new URLSearchParams(location.search).get("live") === "true"
const stream = createTextStream(isLive ? liveSource : simulatedSource, render)
const attention = createAttentionKnobs({
  source: simulatedAttention,
  textElement: element,
  isPastEnd: (point) => isAhead(caretAt(point, metrics), caret),
})
let caret = caretAt(start, metrics)
let shownCount: number | undefined
let dwellTimer: number | undefined
let prepared: { text: string; layout: PreparedTextWithSegments } | undefined

makeDraggable(handle, { onDrag: moveTo })
onPressAndHold(handle, HOLD_MS, attention.show)

moveTo(start)

function moveTo(point: Point) {
  const previous = caret
  caret = caretAt(point, metrics)
  handle.style.translate = centeredAt(point, handle.offsetWidth)
  render()
  if (isAhead(caret, previous)) generateAtEndOfText("pointer moved right")
}

function render() {
  const lines = layoutLines(prepareWords(), caret, innerWidth - metrics.padding * 2)
  const text = lines.join(" ")
  const count = countWords(text)

  if (shownCount !== undefined && count < shownCount) stream.truncate(count)
  if (count !== shownCount) restartDwell()
  shownCount = count
  const content = lines.join("\n")
  if (element.textContent !== content) element.textContent = content
  attention.update(text)
}

function restartDwell() {
  clearTimeout(dwellTimer)
  dwellTimer = setTimeout(() => {
    attention.prefetch()
    generateAtEndOfText("dwell timer")
  }, DWELL_MS)
}

function generateAtEndOfText(trigger: GenerationTrigger) {
  if (shownCount === countWords(stream.text)) stream.generate(trigger)
}

function prepareWords() {
  const text = stream.text
  if (prepared?.text !== text) prepared = { text, layout: prepareWithSegments(text, style.font) }
  return prepared.layout
}
