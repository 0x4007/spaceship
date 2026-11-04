import { $ } from "../dom"
import { KEY_STORAGE, streamCompletion } from "./cerebras"

const SYSTEM_PROMPT = `You are a brainstorming engine whose output is read by a program, not a person.

OUTPUT FORMAT
- Output a plain list of items, exactly one item per line.
- Each line has the form: Title: body
- Title is exactly ONE word (letters only, no spaces, hyphens, digits or punctuation).
- Body is 3 to 8 plain words that expand on the title. No trailing period.
- Separate title and body with a colon followed by a single space.
- Output 5 to 10 items, then stop.

STRICT RULES
- No introduction, no conclusion, no commentary, no questions.
- No markdown: no bullets, numbering, bold, headings, code fences or blank lines.
- Never put a newline inside an item.
- Never use a colon inside the body.
- Respond in the language of the user's message.

EXAMPLE
User: ways to relax after work
Assistant:
Walk: stroll around the neighborhood at dusk
Music: play a calm album with headphones
Stretch: loosen shoulders and back for ten minutes
Tea: brew something warm and caffeine free
Journal: write down three thoughts from today`

type Item = { title: string; body: string }

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
      system: SYSTEM_PROMPT,
      user: question,
      temperature: 0.7,
      maxCompletionTokens: 2000,
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

function parseItems(text: string, final: boolean): Item[] {
  const lines = text.split("\n")
  const completeLines = final ? lines : lines.slice(0, -1)
  const partialLine = final ? undefined : lines.at(-1)

  return [...completeLines, partialLine].flatMap((line) => {
    const item = line === undefined ? undefined : parseLine(line)
    return item ? [item] : []
  })
}

function parseLine(line: string): Item | undefined {
  const match = line.match(/^\W*([A-Za-z]+)\s*:\s*(.*)$/)
  if (match) return { title: match[1], body: match[2].trim() }

  const title = line.match(/^\W*([A-Za-z]+)\s*$/)?.[1]
  return title ? { title, body: "" } : undefined
}
