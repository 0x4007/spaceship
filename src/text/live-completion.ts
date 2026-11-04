import { KEY_STORAGE, streamCompletion } from "../chat/cerebras"
import { STORY_REQUEST } from "../chat/story-prompt"
import type { Complete, TextSource } from "./completion"
import { STORIES_STARTS } from "./stories"

/** Picks a random story opening that begins with the same words as `text`. */
function expandToStoryStart(text: string) {
  const words = text.match(/\S+/g) ?? []
  const candidates = STORIES_STARTS.filter((start) => {
    const startWords = start.split(/\s+/)
    return startWords.length >= words.length && words.every((word, i) => word === startWords[i])
  })
  return candidates[Math.floor(Math.random() * candidates.length)] ?? text
}

const completeStory: Complete = async function* (prefix, signal) {
  const apiKey = localStorage.getItem(KEY_STORAGE)
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
