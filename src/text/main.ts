import { prepareWithSegments, type PreparedTextWithSegments } from "@chenglou/pretext"
import { $ } from "../dom.ts"
import { centeredAt, type Point } from "../point.ts"
import { caretAt, isAhead, type TextMetrics } from "./caret.ts"
import { simulatedSource } from "./completion.ts"
import { layoutLines } from "./layout.ts"
import { liveSource } from "./live-completion.ts"
import { createTextStream, type GenerationTrigger } from "./text-stream.ts"
import { countWords } from "./words.ts"

const DWELL_MS = 100

const element = $("#text")
const handle = $<HTMLButtonElement>("#pointer")
const style = getComputedStyle(element)
const metrics: TextMetrics = { padding: parseFloat(style.paddingLeft), lineHeight: parseFloat(style.lineHeight) }
const start: Point = { x: metrics.padding, y: metrics.padding + metrics.lineHeight / 2 }

const isLive = new URLSearchParams(location.search).get("live") === "true"
const stream = createTextStream(isLive ? liveSource : simulatedSource, render)
let caret = caretAt(start, metrics)
let shownCount: number | undefined
let dwellTimer: number | undefined
let prepared: { text: string; layout: PreparedTextWithSegments } | undefined

handle.addEventListener("pointerdown", ({ pointerId }) => handle.setPointerCapture(pointerId))

handle.addEventListener("pointermove", ({ pointerId, pageX, pageY }) => {
  if (handle.hasPointerCapture(pointerId)) moveTo({ x: pageX, y: pageY })
})

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
  const count = countWords(lines.join(" "))

  if (shownCount !== undefined && count < shownCount) stream.truncate(count)
  if (count !== shownCount) restartDwell()
  shownCount = count
  element.textContent = lines.join("\n")
}

function restartDwell() {
  clearTimeout(dwellTimer)
  dwellTimer = setTimeout(() => generateAtEndOfText("dwell timer"), DWELL_MS)
}

function generateAtEndOfText(trigger: GenerationTrigger) {
  if (shownCount === countWords(stream.text)) stream.generate(trigger)
}

function prepareWords() {
  const text = stream.text
  if (prepared?.text !== text) prepared = { text, layout: prepareWithSegments(text, style.font) }
  return prepared.layout
}
