import type { Focus, InfluenceSource } from "./influence.ts"
import type { Span } from "./segments.ts"
import { endOf, isComplete, sentenceAt, type StoryLayout } from "./story-layout.ts"

const REQUEST_DELAY_MS = 150
/** Only this many sentences, nearest the focus, are scored, to keep requests small. */
const MAX_SENTENCES = 20
const MAX_CACHED = 50
/** Closer scores are too likely noise to stretch apart. */
const MIN_STRETCHED_RANGE = 0.1
const CONTRAST = 2.5

type SentenceInfluenceOptions = {
  source: InfluenceSource
  textElement: HTMLElement
  knob: HTMLElement
}

/** Scores `sentences` against `focus`; `first` is the span index of the first sentence. */
type Target = { key: string; first: number; sentences: string[]; focus: Focus }

/**
 * Writes the text up to the main knob into `textElement` as one span per sentence.
 * While the pointer is on `knob` or drags it, `textElement` gets `data-weighing` and each span of a previous sentence gets `--influence`:
 * how strongly it shapes the sentence under the knob, scored once that sentence is fully generated.
 * While an attention box is hovered (see `focusPhrase`), each span instead gets how strongly it connects to the box's phrase.
 * When the focus moves, the last scores stay until the new ones all arrive; leaving clears them.
 */
export function createSentenceInfluence({ source, textElement, knob }: SentenceInfluenceOptions) {
  const cache = new Map<string, number[]>()
  let spans: HTMLSpanElement[] = []
  let layout: StoryLayout = { content: "", text: "", combined: "", sentences: [] }
  let phrase: Span | undefined
  let target: Target | undefined
  /** Contrasted strength per span, held across span rebuilds while the next scores are pending. */
  let shown: (number | undefined)[] = []
  let pending: { key: string; controller: AbortController } | undefined
  let timer: number | undefined
  let isHovered = false
  let isDragging = false

  knob.addEventListener("pointerenter", () => setActivity(() => (isHovered = true)))
  knob.addEventListener("pointerleave", () => setActivity(() => (isHovered = false)))
  knob.addEventListener("gotpointercapture", () => setActivity(() => (isDragging = true)))
  knob.addEventListener("lostpointercapture", () => setActivity(() => (isDragging = false)))

  return { update, focusPhrase }

  function update(story: StoryLayout) {
    const { content, text, sentences } = story
    if (textElement.textContent !== content) {
      spans = sentences.filter(({ start }) => start < text.length).map(({ start, end }) => spanOf(content.slice(start, Math.min(end, text.length))))
      textElement.replaceChildren(...spans)
    }
    layout = story
    refresh()
  }

  /** Focuses the phrase at `span` of the shown text, or nothing. */
  function focusPhrase(span: Span | undefined) {
    if (span?.start === phrase?.start && span?.end === phrase?.end) return
    setActivity(() => (phrase = span))
  }

  function setActivity(change: () => void) {
    change()
    textElement.toggleAttribute("data-weighing", isActive())
    refresh()
  }

  function isActive() {
    return isHovered || isDragging || phrase !== undefined
  }

  function refresh() {
    if (isHovered || isDragging) target = nextSentenceTarget(layout)
    else if (phrase) target = keyPhraseTarget(layout, phrase)
    else target = undefined
    paint()
    schedule()
  }

  function schedule() {
    clearTimeout(timer)
    if (!isActive() || !target || cache.has(target.key) || pending?.key === target.key) return
    const scheduled = target
    timer = setTimeout(() => score(scheduled), REQUEST_DELAY_MS)
  }

  async function score({ key, sentences, focus }: Target) {
    pending?.controller.abort()
    const controller = new AbortController()
    pending = { key, controller }
    const strengths: number[] = []
    try {
      for await (const { index, strength } of source(sentences, focus, controller.signal)) strengths[index] = strength
      if (controller.signal.aborted) return
      remember(key, strengths)
      paint()
    } catch (error) {
      if (!controller.signal.aborted) console.error(error)
    } finally {
      if (pending?.controller === controller) pending = undefined
    }
  }

  function remember(key: string, strengths: number[]) {
    cache.set(key, strengths)
    if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value!)
  }

  function paint() {
    const strengths = target && cache.get(target.key)
    if (!isActive()) shown = []
    else if (target && strengths) {
      const { first } = target
      const contrasted = withContrast(strengths)
      shown = spans.map((_, i) => contrasted[i - first])
    }
    spans.forEach((span, i) => {
      const strength = shown[i]
      if (strength === undefined) span.style.removeProperty("--influence")
      else span.style.setProperty("--influence", strength.toFixed(3))
    })
  }
}

/** The complete sentences ending before the knob, scored against the complete sentence after them, if it is generated yet. */
function nextSentenceTarget(layout: StoryLayout): Target | undefined {
  const { combined, sentences, text } = layout
  const count = sentences.findIndex((sentence, i) => endOf(combined, sentence) > text.length || !isComplete(layout, i))
  const previousCount = count === -1 ? sentences.length : count
  if (previousCount === 0 || previousCount === sentences.length || !isComplete(layout, previousCount)) return

  const first = Math.max(0, previousCount - MAX_SENTENCES)
  return targetOf(combined, sentences.slice(first, previousCount), first, { kind: "next sentence", text: sentenceAt(combined, sentences[previousCount]) })
}

/** The shown sentences around `phrase`, scored against it. */
function keyPhraseTarget({ combined, sentences, text }: StoryLayout, phrase: Span): Target | undefined {
  const shownLength = text.length
  if (phrase.end > shownLength) return
  const shown = sentences.filter(({ start }) => start < shownLength).map(({ start, end }) => ({ start, end: Math.min(end, shownLength) }))
  const containing = shown.findIndex(({ end }) => end > phrase.start)
  const first = Math.max(0, Math.min(containing - Math.floor(MAX_SENTENCES / 2), shown.length - MAX_SENTENCES))
  return targetOf(combined, shown.slice(first, first + MAX_SENTENCES), first, { kind: "key phrase", text: sentenceAt(combined, phrase) })
}

function targetOf(text: string, sentences: Span[], first: number, focus: Focus): Target {
  const texts = sentences.map((sentence) => sentenceAt(text, sentence))
  return { key: JSON.stringify([focus, texts]), first, sentences: texts, focus }
}

/** Stretches the scores to fill 0 to 1, then pushes them toward the ends, so the strongest and weakest sentences stand apart even when the model scores them closely. */
function withContrast(strengths: number[]) {
  const scored = strengths.filter((strength) => strength !== undefined)
  const min = Math.min(...scored)
  const range = Math.max(...scored) - min
  return strengths.map((strength) => sCurve(range > MIN_STRETCHED_RANGE ? (strength - min) / range : strength))
}

function sCurve(x: number) {
  return x ** CONTRAST / (x ** CONTRAST + (1 - x) ** CONTRAST)
}

function spanOf(text: string) {
  return Object.assign(document.createElement("span"), { textContent: text })
}
