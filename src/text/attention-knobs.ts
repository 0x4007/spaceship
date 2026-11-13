import { centeredAt, type Point } from "../point.ts"
import { startAttention, type AttentionGeneration, type AttentionSource } from "./attention.ts"
import { makeDraggable } from "./drag.ts"
import { countWords } from "./words.ts"

type AttentionKnobsOptions = { source: AttentionSource; template: HTMLTemplateElement; textElement: HTMLElement }

/** Places knobs on words of the text before the main knob, generating ahead so they are ready when shown. */
export function createAttentionKnobs({ source, template, textElement }: AttentionKnobsOptions) {
  const knobs = new Map<HTMLElement, number>()
  let text = ""
  let count = 0
  let prefetched: AttentionGeneration | undefined
  let shown: AttentionGeneration | undefined

  return { update, prefetch, show }

  function update(nextText: string) {
    const nextCount = countWords(nextText)
    if (nextCount !== count) discardPrefetched()
    if (nextCount < count) removeKnobsFrom(nextCount)
    text = nextText
    count = nextCount
  }

  function prefetch() {
    if (count && prefetched?.text !== text) prefetched = startAttention(source, text)
  }

  async function show() {
    shown?.abort()
    removeKnobsFrom(0)
    if (!count) return

    const generation = takePrefetched() ?? startAttention(source, text)
    shown = generation

    for await (const { wordIndex } of generation) {
      if (shown !== generation) return
      if (wordIndex < count) spawnKnob(wordIndex)
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
    const place = (point: Point) => (knob.style.translate = centeredAt(point, knob.offsetWidth))
    document.body.append(knob)
    knobs.set(knob, wordIndex)
    place(centerOf(wordRange(textElement.firstChild!, wordIndex)))
    makeDraggable(knob, place)
  }

  function removeKnobsFrom(count: number) {
    for (const [knob, wordIndex] of knobs) {
      if (wordIndex < count) continue
      knob.remove()
      knobs.delete(knob)
    }
  }
}

function wordRange(textNode: Node, index: number) {
  const match = [...(textNode.textContent ?? "").matchAll(/\S+/g)][index]
  const range = document.createRange()
  range.setStart(textNode, match.index)
  range.setEnd(textNode, match.index + match[0].length)
  return range
}

function centerOf(range: Range): Point {
  const { left, top, width, height } = range.getBoundingClientRect()
  return { x: scrollX + left + width / 2, y: scrollY + top + height / 2 }
}
