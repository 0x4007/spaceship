import { storedApiKey, streamCompletion } from "../llm/cerebras.ts"
import type { Dimension, DimensionContext, DimensionSource } from "./dimension.ts"

const MAX_WORDS_PER_LABEL = 3

const SYSTEM_PROMPT = `
You choose one "knob" for the next ~100 words of a story: one dimension the reader can slide. The user message has the story so far (cut off where the reader is), optional key phrases (the reader's highlights, keyword in brackets), and the axes already taken.

Catalog, in priority order (type: low / high or options):
1. tension (scale): relaxed / strained
2. resolution (scale): open question / answered
3. pace (scale): compressed / expanded
4. mode (choice): dialogue / action / description
5. focus (choice): the characters present, plus narrator. Only someone who can think and speak, never a place, object or vague presence; skip focus unless two or more are present
6. tone (choice): wry / tender / somber / wondrous
7. distance (scale): outside view / inside mind
8. fortune (scale): worsens / improves
9. surprise (scale): expected / unexpected

Rules:
- Pick one axis that is not taken. Choose the free one that matters most for what could happen next at this exact point; if nothing stands out, the earliest free one.
- If key phrases are given, prefer a free axis that can act on them, and put a word from a key phrase into at least one pole or option (for example key phrase "his late [wife's]" gives focus option "his late wife", or a tone "grieving"). Wording is where the phrase shows: every pole or option should be about this story's phrase subjects rather than generic, but stay within 3 words each.
- Keep the axis type from the catalog and the order low to high. Each pole or option is at most 3 words, lower case except names. Reword for this story when it helps. Focus options must be characters actually in the story (name or short description like "the stranger"); never invent any. Tone is always a choice.
- If all nine are taken, invent a new axis with a one-word name independent of all nine, as a scale.
- Output exactly one line and nothing else, starting with scale or choice:
scale | axis | low pole | high pole
choice | axis | option | option | option (2 to 4 options)

Example
Story: Mara lay still and listened. In the kitchen, a chair scraped across the tiles.
Key phrases:
- the [kitchen] she locked
Taken: tension
Output: choice | mode | whispered talk | searching | kitchen sounds
`.trim()

const CATALOG: Dimension[] = [
  { name: "tension", kind: "scale", low: "relaxed", high: "strained" },
  { name: "resolution", kind: "scale", low: "open question", high: "answered" },
  { name: "pace", kind: "scale", low: "compressed", high: "expanded" },
  { name: "mode", kind: "choice", options: ["dialogue", "action", "description"] },
  { name: "focus", kind: "choice", options: [] },
  { name: "tone", kind: "choice", options: ["wry", "tender", "somber", "wondrous"] },
  { name: "distance", kind: "scale", low: "outside view", high: "inside mind" },
  { name: "fortune", kind: "scale", low: "worsens", high: "improves" },
  { name: "surprise", kind: "scale", low: "expected", high: "unexpected" },
]

export const liveDimension: DimensionSource = async (context, signal) => {
  const apiKey = storedApiKey()
  if (!apiKey) throw new Error("save an API key first")

  let output = ""
  const deltas = streamCompletion({ apiKey, system: SYSTEM_PROMPT, user: userMessageOf(context), temperature: 0.3, maxCompletionTokens: 1500, signal })
  for await (const delta of deltas) output += delta

  const takenNames = context.taken.map(({ name }) => name.toLowerCase())
  const parsed = parseDimension(output)
  if (parsed && isAcceptable(parsed, takenNames)) return parsed
  return fallbackDimension(takenNames)
}

function userMessageOf({ text, leads, taken }: DimensionContext) {
  const keyPhrases = leads.length ? `\nKey phrases:\n${leads.map(({ before, keyword, after }) => `- ${before}[${keyword}]${after}`).join("\n")}` : ""
  const takenNames = taken.map(({ name }) => name).join(", ") || "none"
  return `Story: ${text}${keyPhrases}\nTaken: ${takenNames}`
}

function parseDimension(output: string): Dimension | undefined {
  for (const line of output.split("\n")) {
    const fields = line
      .replace(/\s+/g, " ")
      .trim()
      .split("|")
      .map((field) => field.trim())
    if (fields.length < 4) continue
    const kind = fields[0].toLowerCase()
    if (kind !== "scale" && kind !== "choice") continue

    const name = fields[1].toLowerCase()
    const labels = fields.slice(2)
    if (!name || !labels.every(isValidLabel)) return

    if (kind === "scale") return labels.length === 2 ? { name, kind, low: labels[0], high: labels[1] } : undefined
    return labels.length <= 4 ? { name, kind, options: labels } : undefined
  }
}

function isValidLabel(label: string) {
  return label !== "" && label.split(" ").length <= MAX_WORDS_PER_LABEL
}

function isAcceptable(dimension: Dimension, takenNames: string[]) {
  if (takenNames.includes(dimension.name)) return false
  const catalogEntry = CATALOG.find(({ name }) => name === dimension.name)
  return !catalogEntry || catalogEntry.kind === dimension.kind
}

function fallbackDimension(takenNames: string[]) {
  const dimension = CATALOG.find((entry) => !takenNames.includes(entry.name) && (entry.kind === "scale" || entry.options.length))
  if (!dimension) throw new Error("no dimension left")
  return structuredClone(dimension)
}
