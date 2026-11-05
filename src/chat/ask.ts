import { showError } from "../dom.ts"
import { storedApiKey, streamCompletion } from "../llm/cerebras.ts"
import type { ItemSlots } from "./item-slots.ts"
import { ITEMS_REQUEST, parseItems, parseStreamedItems } from "./items.ts"

export function createAsker(slots: ItemSlots, status: HTMLOutputElement) {
  let controller: AbortController | undefined

  const cancel = () => {
    controller?.abort()
    slots.reset()
  }

  const ask = async (question: string) => {
    controller?.abort()

    const apiKey = storedApiKey()
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

  return Object.assign(ask, { cancel })
}
