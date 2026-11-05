export type Item = { title: string; body: string }

export const ITEMS_SYSTEM_PROMPT = `You are a brainstorming engine whose output is read by a program, not a person.

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

export const ITEMS_REQUEST = {
  system: ITEMS_SYSTEM_PROMPT,
  temperature: 0.7,
  maxCompletionTokens: 2000,
}

export const sentenceOf = ({ title, body }: Item) => body || title

export function parseItems(text: string, final: boolean): Item[] {
  const lines = text.split("\n")
  const completeLines = final ? lines : lines.slice(0, -1)
  const partialLine = final ? undefined : lines.at(-1)

  return [...completeLines, partialLine].flatMap((line) => (line === undefined ? [] : (parseLine(line) ?? [])))
}

export function parseStreamedItems(text: string): Item[] {
  const lines = text.split("\n")
  const partialLine = lines.pop() ?? ""

  return [...lines, ...(partialLine.includes(":") ? [partialLine] : [])].flatMap((line) => parseLine(line) ?? [])
}

function parseLine(line: string): Item | undefined {
  const match = line.match(/^\W*([A-Za-z]+)\s*:\s*(.*)$/)
  if (match) return { title: match[1], body: match[2].trim() }

  const title = line.match(/^\W*([A-Za-z]+)\s*$/)?.[1]
  return title ? { title, body: "" } : undefined
}
