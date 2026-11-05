import { storedApiKey, streamCompletion } from "../llm/cerebras.ts"
import { STORY_OPENINGS } from "../story/openings.ts"
import { STORY_REQUEST } from "../story/prompt.ts"
import type { Complete, TextSource } from "./completion.ts"

/** Picks a random story opening that begins with the same words as `text`. */
function expandToStoryStart(text: string) {
  const words = text.match(/\S+/g) ?? []
  const candidates = STORY_OPENINGS.filter((start) => {
    const startWords = start.split(/\s+/)
    return startWords.length >= words.length && words.every((word, i) => word === startWords[i])
  })
  return candidates[Math.floor(Math.random() * candidates.length)] ?? text
}

const completeStory: Complete = async function* (prefix, signal) {
  const apiKey = storedApiKey()
  if (!apiKey) throw new Error("save an API key first")

  let started = false
  for await (let delta of streamCompletion({ ...STORY_REQUEST, apiKey, user: prefix, signal })) {
    if (!started) {
      delta = delta.trimStart()
      if (!delta) continue
      started = true
      delta = ` ${delta}`
    }
    yield delta
  }
}

export const liveSource: TextSource = { expand: expandToStoryStart, complete: completeStory }
