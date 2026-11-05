import { $ } from "../dom"
import { KEY_STORAGE, streamCompletion } from "./cerebras"
import { ITEMS_REQUEST, parseItems, type Item } from "./items"

const keyForm = $<HTMLFormElement>("#key-form")
const keyInput = $<HTMLInputElement>("#api-key")
const keyStatus = $<HTMLOutputElement>("#key-status")
const askForm = $<HTMLFormElement>("#ask-form")
const questionInput = $<HTMLInputElement>("#question")
const askButton = $<HTMLButtonElement>("#ask")
const stopButton = $<HTMLButtonElement>("#stop")
const status = $<HTMLOutputElement>("#status")
const list = $<HTMLDListElement>("#items")
const raw = $("#raw")

let controller: AbortController | undefined

keyInput.value = localStorage.getItem(KEY_STORAGE) ?? ""
keyStatus.value = keyInput.value ? "key loaded" : ""

keyForm.addEventListener("submit", (event) => {
  event.preventDefault()
  localStorage.setItem(KEY_STORAGE, keyInput.value.trim())
  keyStatus.value = "saved"
})

askForm.addEventListener("submit", async (event) => {
  event.preventDefault()
  await ask(questionInput.value.trim())
})

stopButton.addEventListener("click", () => controller?.abort())

async function ask(question: string) {
  const apiKey = localStorage.getItem(KEY_STORAGE)
  if (!apiKey) {
    status.value = "error: save an API key first"
    return
  }

  controller = new AbortController()
  list.replaceChildren()
  raw.textContent = ""
  status.value = "waiting…"
  setBusy(true)

  let text = ""
  try {
    for await (const delta of streamCompletion({
      apiKey,
      ...ITEMS_REQUEST,
      user: question,
      signal: controller.signal,
    })) {
      text += delta
      raw.textContent = text
      render(parseItems(text, false))
    }
    render(parseItems(text, true))
    status.value = "done"
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === "AbortError"
    status.value = aborted ? "stopped" : `error: ${error instanceof Error ? error.message : error}`
  } finally {
    setBusy(false)
  }
}

function setBusy(busy: boolean) {
  askButton.disabled = busy
  stopButton.hidden = !busy
}

function render(items: Item[]) {
  list.replaceChildren(
    ...items.flatMap(({ title, body }) => {
      const dt = Object.assign(document.createElement("dt"), { textContent: title })
      const dd = Object.assign(document.createElement("dd"), { textContent: body })
      return [dt, dd]
    }),
  )
}
