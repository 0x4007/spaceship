import { KEY_STORAGE, streamCompletion } from "../chat/cerebras"
import { STORY_SYSTEM_PROMPT } from "../chat/story-prompt"
import type { Complete } from "./completion"
import { STORIES_STARTS } from "./stories"

export function expandToStoryStart(text: string) {
  const words = text.match(/\S+/g) ?? []
  const candidates = STORIES_STARTS.filter((start) => {
    const startWords = start.split(/\s+/)
    return startWords.length >= words.length && words.every((word, i) => word === startWords[i])
  })
  return candidates[Math.floor(Math.random() * candidates.length)] ?? text
}

export const liveComplete: Complete = async function* (prefix, signal) {
  const apiKey = localStorage.getItem(KEY_STORAGE)
  if (!apiKey) throw new Error("save an API key first")

  let first = true
  for await (const delta of streamCompletion({
    apiKey,
    system: STORY_SYSTEM_PROMPT,
    user: prefix,
    temperature: 0.9,
    maxCompletionTokens: 2000,
    signal,
  })) {
    if (first) {
      const text = delta.trimStart()
      if (!text) continue
      first = false
      yield prefix ? ` ${text}` : text
    } else {
      yield delta
    }
  }
}
