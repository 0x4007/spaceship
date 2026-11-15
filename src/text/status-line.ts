import type { StreamActivity } from "./text-stream.ts"

/** What the model is doing, and what the text holds and is steered by. */
export type Status = StreamActivity & { words: number; boxes: number; steering: number; pinned: number }

/** Writes `status` into `element` as one labelled value per field; a field not measured yet reads as a dash. */
export function showStatus(element: HTMLElement, { isGenerating, firstChunkMs, wordsPerSecond, words, boxes, steering, pinned }: Status) {
  const state = Object.assign(document.createElement("span"), { textContent: isGenerating ? "streaming" : "idle" })
  state.dataset.state = isGenerating ? "streaming" : "idle"
  element.replaceChildren(
    state,
    field("rate", wordsPerSecond === undefined ? undefined : `${Math.round(wordsPerSecond)} w/s`),
    field("first chunk", firstChunkMs === undefined ? undefined : `${Math.round(firstChunkMs)}ms`),
    field("words", `${words}`),
    field("boxes", `${boxes}`),
    field("steering", `${steering}`),
    field("pinned", `${pinned}`),
  )
}

function field(name: string, value = "—") {
  const span = document.createElement("span")
  span.append(name, " ", Object.assign(document.createElement("b"), { textContent: value }))
  return span
}
