import { $, showStopOrError } from "../dom.ts"
import { storedApiKey, streamCompletion } from "../llm/cerebras.ts"
import { STORY_OPENINGS } from "../story/openings.ts"
import { STORY_MAX_WORDS, STORY_REQUEST } from "../story/prompt.ts"

const form = $<HTMLFormElement>("#story-form")
const select = $<HTMLSelectElement>("#story-start")
const continueButton = $<HTMLButtonElement>("#story-continue")
const stopButton = $<HTMLButtonElement>("#story-stop")
const status = $<HTMLOutputElement>("#story-status")
const article = $("#story")

let controller: AbortController | undefined

select.replaceChildren(...STORY_OPENINGS.map((start) => new Option(start, start)))

form.addEventListener("submit", async (event) => {
  event.preventDefault()
  await continueStory(select.value)
})

stopButton.addEventListener("click", () => controller?.abort())

article.addEventListener("click", async ({ clientX, clientY }) => {
  if (!stopButton.hidden) return
  const prefix = prefixThroughWordAt(clientX, clientY)
  if (prefix) await continueStory(prefix)
})

async function continueStory(start: string) {
  const apiKey = storedApiKey()
  if (!apiKey) {
    status.value = "error: save an API key first"
    return
  }

  article.textContent = start

  controller = new AbortController()
  status.value = "waiting…"
  setBusy(true)

  let continuation = ""
  try {
    for await (const delta of streamCompletion({ ...STORY_REQUEST, apiKey, user: start, signal: controller.signal })) {
      continuation += delta
      const capped = capWords(continuation, STORY_MAX_WORDS)
      article.textContent = joinStory(start, capped)
      if (capped !== continuation) {
        controller.abort()
        break
      }
    }
    status.value = "done"
  } catch (error) {
    showStopOrError(status, error)
  } finally {
    setBusy(false)
  }
}

function setBusy(busy: boolean) {
  continueButton.disabled = busy
  stopButton.hidden = !busy
}

function prefixThroughWordAt(x: number, y: number) {
  const position = document.caretPositionFromPoint(x, y)
  if (position?.offsetNode.parentNode !== article) return
  const text = article.textContent ?? ""
  const word = [...text.matchAll(/\S+/g)].findLast(({ index }) => index <= position.offset)
  return word && text.slice(0, word.index + word[0].length)
}

function joinStory(start: string, continuation: string) {
  const text = continuation.trimStart()
  return text ? `${start} ${text}` : start
}

function capWords(text: string, limit: number) {
  const words = [...text.matchAll(/\S+/g)]
  if (words.length <= limit) return text
  const last = words[limit - 1]
  return last ? text.slice(0, last.index + last[0].length) : ""
}
