import { centeredAt, type Point } from "../point.ts"
import { startAttention, type AttentionGeneration, type AttentionSource } from "./attention.ts"
import { makeDraggable } from "./drag.ts"
import { wordSpans, type Span } from "./segments.ts"

const WORD_HIGHLIGHT = "attention-word"
const CONTEXT_WORDS = 3
/** Must match the `::highlight(attention-shade-N)` rules in the page styles. */
const SHADE_LEVELS = 5

type AttentionKnobsOptions = {
  source: AttentionSource
  template: HTMLTemplateElement
  textElement: HTMLElement
  isPastEnd: (point: Point) => boolean
}

/**
 * Places knobs on words of the text before the main knob, generating ahead so they are ready when shown.
 * `text` must equal the element's text with line breaks as spaces, so offsets match the DOM text node.
 */
export function createAttentionKnobs({ source, template, textElement, isPastEnd }: AttentionKnobsOptions) {
  const knobs = new Map<HTMLElement, Point>()
  let text = ""
  let words: Span[] = []
  let wordBoxes: DOMRect[] | undefined
  let prefetched: AttentionGeneration | undefined
  let shown: AttentionGeneration | undefined

  return { update, prefetch, show }

  /** Repaints even when `nextText` is unchanged, because the main knob may have moved past an attention knob. */
  function update(nextText: string) {
    if (nextText !== text) {
      text = nextText
      words = wordSpans(text)
      wordBoxes = undefined
      discardPrefetched()
    }
    paint()
  }

  function prefetch() {
    if (words.length && prefetched?.text !== text) prefetched = startAttention(source, text)
  }

  async function show() {
    shown?.abort()
    removeAllKnobs()
    if (!words.length) return

    const generation = takePrefetched() ?? startAttention(source, text)
    shown = generation

    for await (const { wordIndex } of generation) {
      if (shown !== generation) return
      if (wordIndex < words.length) spawnKnob(wordIndex)
    }
  }

  function takePrefetched() {
    const generation = prefetched
    prefetched = undefined
    if (generation?.text === text) return generation
    generation?.abort()
  }

  function discardPrefetched() {
    prefetched?.abort()
    prefetched = undefined
  }

  function spawnKnob(wordIndex: number) {
    const knob = template.content.firstElementChild!.cloneNode(true) as HTMLElement
    document.body.append(knob)
    place(knob, centerOf(boxes()[wordIndex]))
    makeDraggable(knob, (point) => place(knob, point), () => dedupe(knob))
  }

  function place(knob: HTMLElement, point: Point) {
    knobs.set(knob, point)
    knob.style.translate = centeredAt(point, knob.offsetWidth)
    paint()
  }

  function dedupe(knob: HTMLElement) {
    const word = wordNear(knobs.get(knob)!)
    const isDuplicate = word !== undefined && [...knobs].some(([other, point]) => other !== knob && wordNear(point) === word)
    if (!isDuplicate) return
    knob.remove()
    knobs.delete(knob)
    paint()
  }

  function removeAllKnobs() {
    for (const knob of knobs.keys()) knob.remove()
    knobs.clear()
    paint()
  }

  function paint() {
    const targets = [...knobs.values()].map(wordNear).filter((index) => index !== undefined)
    const coverage = coverageOf(targets, words.length)
    CSS.highlights.set(WORD_HIGHLIGHT, new Highlight(...targets.map((index) => rangeOf(index, index))))
    for (let level = 1; level <= SHADE_LEVELS; level++) {
      const ranges = runsAtLeast(coverage, level).map(([first, last]) => rangeOf(first, last))
      CSS.highlights.set(`attention-shade-${level}`, new Highlight(...ranges))
    }
  }

  function wordNear(point: Point) {
    if (!words.length || isPastEnd(point)) return
    return nearestIndex(boxes(), point)
  }

  function boxes() {
    return (wordBoxes ??= words.map((_, index) => pageRect(rangeOf(index, index).getBoundingClientRect())))
  }

  function rangeOf(firstWord: number, lastWord: number) {
    const range = document.createRange()
    range.setStart(textElement.firstChild!, words[firstWord].start)
    range.setEnd(textElement.firstChild!, words[lastWord].end)
    return range
  }
}

/** Counts, per word, how many targets include it within their ±`CONTEXT_WORDS` window. */
function coverageOf(targets: number[], wordCount: number) {
  const coverage = new Array<number>(wordCount).fill(0)
  for (const target of targets) {
    const last = Math.min(wordCount - 1, target + CONTEXT_WORDS)
    for (let i = Math.max(0, target - CONTEXT_WORDS); i <= last; i++) coverage[i]++
  }
  return coverage
}

/** Contiguous `[first, last]` word runs covered at least `level` times. */
function runsAtLeast(coverage: number[], level: number) {
  const runs: [number, number][] = []
  coverage.forEach((count, i) => {
    if (count < level) return
    const run = runs.at(-1)
    if (run?.[1] === i - 1) run[1] = i
    else runs.push([i, i])
  })
  return runs
}

/** Prefers the nearest line, then the nearest word on that line, so gaps between lines and words still map to a word. */
function nearestIndex(boxes: DOMRect[], point: Point) {
  const distance = (box: DOMRect) => [gap(point.y, box.top, box.bottom), gap(point.x, box.left, box.right)]
  return boxes.reduce((best, box, i) => {
    const [dy, dx] = distance(box)
    const [bestDy, bestDx] = distance(boxes[best])
    return dy < bestDy || (dy === bestDy && dx < bestDx) ? i : best
  }, 0)
}

function gap(value: number, min: number, max: number) {
  return Math.max(min - value, 0, value - max)
}

function pageRect({ x, y, width, height }: DOMRect) {
  return new DOMRect(x + scrollX, y + scrollY, width, height)
}

function centerOf({ x, y, width, height }: DOMRect): Point {
  return { x: x + width / 2, y: y + height / 2 }
}
