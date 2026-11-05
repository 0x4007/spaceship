import { showError } from "../dom.ts"
import { announce } from "../feedback.ts"
import { storedApiKey, streamCompletion } from "../llm/cerebras.ts"
import type { ItemSlots } from "./item-slots.ts"
import { ITEMS_REQUEST, type Item, parseItems, parseStreamedItems, promptWithContext } from "./items.ts"

export type AskRun = {
  phase: "idle" | "asking" | "streaming" | "done" | "cancelled" | "error"
  question: string
  startedAt: number
  firstItemAt?: number
  endedAt?: number
  items: number
  text: string
}

const IDLE: AskRun = { phase: "idle", question: "", startedAt: 0, items: 0, text: "" }

export function createAsker(slots: ItemSlots, status: HTMLOutputElement) {
  let controller: AbortController | undefined
  let run = IDLE

  const cancel = () => {
    controller?.abort()
    slots.reset()
    if (run.phase === "asking" || run.phase === "streaming") run = { ...run, phase: "cancelled", endedAt: performance.now() }
  }

  const ask = async (question: string, context: string[] = []) => {
    controller?.abort()

    const apiKey = storedApiKey()
    if (!apiKey) {
      run = { ...IDLE, phase: "error", question, startedAt: performance.now(), endedAt: performance.now() }
      return showError(status, "cerebras api key missing")
    }

    const { signal } = (controller = new AbortController())
    let text = ""

    run = { ...IDLE, phase: "asking", question, startedAt: performance.now() }
    slots.reset()
    status.value = `asking: ${question}`

    const sync = (items: Item[]) => {
      slots.sync(items)
      run = { ...run, items: items.length, text }
      if (run.firstItemAt !== undefined || items.length === 0) return

      run.firstItemAt = performance.now()
      announce("results", items[0].title)
    }

    try {
      for await (const delta of streamCompletion({ ...ITEMS_REQUEST, apiKey, user: promptWithContext(question, context), signal })) {
        text += delta
        run = { ...run, phase: "streaming" }
        sync(parseStreamedItems(text))
      }
      sync(parseItems(text, true))
      run = { ...run, phase: "done", endedAt: performance.now() }
      status.value = `answered: ${question}`
    } catch (error) {
      if (signal.aborted) return

      run = { ...run, phase: "error", endedAt: performance.now() }
      showError(status, error)
    }
  }

  return Object.assign(ask, { cancel, run: () => run })
}
