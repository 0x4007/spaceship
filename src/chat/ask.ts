import { showError } from "../dom.ts"
import { KEY_STORAGE, streamCompletion } from "./cerebras.ts"
import type { createItemSlots } from "./item-slots.ts"
import { ITEMS_REQUEST, parseItems, parseStreamedItems } from "./items.ts"

export function createAsker(slots: ReturnType<typeof createItemSlots>, status: HTMLOutputElement) {
  let controller: AbortController | undefined

  return async (question: string) => {
    controller?.abort()

    const apiKey = localStorage.getItem(KEY_STORAGE)?.trim()
    if (!apiKey) return showError(status, "cerebras api key missing")

    const { signal } = (controller = new AbortController())
    let text = ""

    slots.reset()
    status.value = `asking: ${question}`

    try {
      for await (const delta of streamCompletion({ ...ITEMS_REQUEST, apiKey, user: question, signal })) {
        text += delta
        slots.sync(parseStreamedItems(text))
      }
      slots.sync(parseItems(text, true))
      status.value = `answered: ${question}`
    } catch (error) {
      if (!signal.aborted) showError(status, error)
    }
  }
}
