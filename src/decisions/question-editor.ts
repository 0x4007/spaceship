import type { Question } from "../llm/decisions.ts"

type QuestionType = Question["type"]

export type QuestionDraft = { key: string; type: QuestionType; instructions: string; criteria: string }

const CRITERIA_HINTS: Record<QuestionType, string> = {
  noul: "optional, lines: true: … / false: …",
  choice: "one option per line: id: description (description optional, 2–255 options)",
  score: "one level per line, lowest first (2–10 recommended)",
}

export const PRESETS: Record<string, QuestionDraft[]> = {
  "text: support ticket": [
    {
      key: "damaged",
      type: "noul",
      instructions: "Did the item arrive damaged?",
      criteria: "true: The product itself is broken or faulty.\nfalse: Preference, sizing, shipping, or pricing complaint.",
    },
    {
      key: "dept",
      type: "choice",
      instructions: "Which team should handle this message?",
      criteria:
        "billing: Charges, refunds, invoices.\nshipping: Delivery, tracking, damage in transit.\ntechnical: Product does not work as expected.\nother: Anything else.",
    },
    { key: "severity", type: "score", instructions: "How severe is the customer's problem?", criteria: "Cosmetic issue\nWorkaround exists\nFully blocked" },
    { key: "angry", type: "noul", instructions: "Is the customer angry?", criteria: "" },
  ],
  "image: webcam scene": [
    { key: "person", type: "noul", instructions: "Is there a person visible in the image?", criteria: "" },
    {
      key: "expression",
      type: "choice",
      instructions: "What is the facial expression of the main person?",
      criteria: "happy\nneutral\nsad\nsurprised\nno_face: No face is visible.",
    },
    { key: "lighting", type: "score", instructions: "How good is the lighting of the image?", criteria: "Very dark\nDim\nAcceptable\nWell lit" },
    { key: "holding", type: "noul", instructions: "Is someone holding an object up to the camera?", criteria: "" },
  ],
  "audio: voice clip": [
    { key: "speech", type: "noul", instructions: "Does the audio contain human speech?", criteria: "" },
    {
      key: "language",
      type: "choice",
      instructions: "Which language is spoken?",
      criteria: "chinese\nenglish\njapanese\nspanish\nother: Another language or no speech.",
    },
    { key: "pace", type: "score", instructions: "How fast is the speaker talking?", criteria: "Very slow\nSlow\nNormal\nFast\nVery fast" },
    { key: "emotion", type: "choice", instructions: "What emotion does the speaker's tone convey?", criteria: "calm\nexcited\nfrustrated\nsad" },
    { key: "question", type: "noul", instructions: "Is the speaker asking a question?", criteria: "" },
  ],
  "mixed: text + image + audio": [
    { key: "consistent", type: "noul", instructions: "Do the image, the audio and the text all describe the same situation?", criteria: "" },
    { key: "modality", type: "choice", instructions: "Which part of the input carries the most information?", criteria: "audio\nimage\ntext" },
    {
      key: "mood",
      type: "score",
      instructions: "Across all inputs, how positive is the overall mood?",
      criteria: "Very negative\nNegative\nNeutral\nPositive\nVery positive",
    },
  ],
}

export function createQuestionEditor(list: HTMLElement, template: HTMLTemplateElement) {
  function add(draft: QuestionDraft = { key: `q${list.children.length + 1}`, type: "noul", instructions: "", criteria: "" }) {
    const fieldset = template.content.firstElementChild!.cloneNode(true) as HTMLFieldSetElement
    const field = <T extends HTMLElement>(name: string) => fieldset.querySelector<T>(`[name="${name}"]`)!
    const type = field<HTMLSelectElement>("type")
    const criteria = field<HTMLTextAreaElement>("criteria")
    const updateHint = () => {
      criteria.placeholder = CRITERIA_HINTS[type.value as QuestionType]
      criteria.required = type.value !== "noul"
    }

    field<HTMLInputElement>("key").value = draft.key
    type.value = draft.type
    field<HTMLTextAreaElement>("instructions").value = draft.instructions
    criteria.value = draft.criteria
    updateHint()

    type.addEventListener("change", updateHint)
    field("remove").addEventListener("click", () => fieldset.remove())
    list.append(fieldset)
  }

  function load(drafts: QuestionDraft[]) {
    list.replaceChildren()
    drafts.forEach(add)
  }

  function read() {
    const drafts = [...list.querySelectorAll("fieldset")].map((fieldset) => {
      const value = (name: string) => fieldset.querySelector<HTMLInputElement>(`[name="${name}"]`)!.value
      return { key: value("key").trim(), type: value("type") as QuestionType, instructions: value("instructions").trim(), criteria: value("criteria") }
    })
    return toQuestions(drafts)
  }

  return { add, load, read }
}

function toQuestions(drafts: QuestionDraft[]) {
  const questions: Record<string, Question> = {}
  for (const draft of drafts) {
    if (draft.key in questions) throw new Error(`duplicate question key "${draft.key}"`)
    questions[draft.key] = toQuestion(draft)
  }
  if (!drafts.length) throw new Error("add at least one question")
  return questions
}

function toQuestion({ type, instructions, criteria }: QuestionDraft): Question {
  const lines = criteria
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)

  if (type === "score") return { type, instructions, criteria: lines }

  const pairs = lines.map((line) => {
    const colon = line.indexOf(":")
    return colon < 0 ? [line, ""] : [line.slice(0, colon).trim(), line.slice(colon + 1).trim()]
  })

  if (type === "choice") return { type, instructions, criteria: Object.fromEntries(pairs) }

  const descriptions = Object.fromEntries(pairs.filter(([side]) => side === "true" || side === "false").map(([side, text]) => [`${side}_description`, text]))
  return Object.keys(descriptions).length ? { type, instructions, criteria: descriptions } : { type, instructions }
}
