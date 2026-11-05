import { showError } from "../dom.ts"
import { storedApiKey, streamCompletion } from "../llm/cerebras.ts"
import { sounds } from "../sound/sounds.ts"
import type { ItemSlots } from "./item-slots.ts"
import { ITEMS_REQUEST, type Item, parseItems, parseStreamedItems, promptWithContext } from "./items.ts"

export function createAsker(slots: ItemSlots, status: HTMLOutputElement) {
  let controller: AbortController | undefined

  const cancel = () => {
    controller?.abort()
    slots.reset()
  }

  const ask = async (question: string, context: string[] = []) => {
    controller?.abort()

    const apiKey = storedApiKey()
    if (!apiKey) return showError(status, "cerebras api key missing")

    const { signal } = (controller = new AbortController())
    let text = ""
    let announced = false

    slots.reset()
    status.value = `asking: ${question}`

    const sync = (items: Item[]) => {
      slots.sync(items)
      if (announced || items.length === 0) return

      announced = true
      sounds.results()
    }

    try {
      for await (const delta of streamCompletion({ ...ITEMS_REQUEST, apiKey, user: promptWithContext(question, context), signal })) {
        text += delta
        sync(parseStreamedItems(text))
      }
      sync(parseItems(text, true))
      status.value = `answered: ${question}`
    } catch (error) {
      if (!signal.aborted) showError(status, error)
    }
  }

  return Object.assign(ask, { cancel })
}
