import { createDecisions, type Question } from "../llm/gateway.ts"
import type { RelevanceSource } from "./keyword-relevance.ts"

const LEVELS = [
  "Not relevant",
  "Weak: shares the setting or a passing detail",
  "Moderate: bears on what the tip is about",
  "Strong: the tip is about it, or turns on it",
]

export const liveRelevance: RelevanceSource = async function* ({ story, tip, leads }, signal) {
  for (let offset = 0; offset < leads.length; offset += 20) {
    signal.throwIfAborted()
    const batch = leads.slice(offset, offset + 20)
    const input = [
      ...(story ? [`STORY SO FAR\n${story}`] : []),
      `TIP (the sentence being written now)\n${tip}`,
      `KEYWORDS\n${batch.map(({ before, keyword, after }, i) => `[${offset + i + 1}] ${keyword} (in "${before}${keyword}${after}")`).join("\n")}`,
    ].join("\n\n")
    const questions = Object.fromEntries(
      batch.map((lead, i): [string, Question] => [
        keyOf(offset + i),
        { type: "score", instructions: `How relevant is keyword [${offset + i + 1}] "${lead.keyword}" to the TIP?`, criteria: LEVELS },
      ]),
    )
    const { answers } = await createDecisions({ input, questions }, signal)
    for (const local of batch.keys()) {
      signal.throwIfAborted()
      const index = offset + local
      const answer = answers[keyOf(index)]
      if (answer?.type === "score") yield { index, relevance: answer.score / (LEVELS.length - 1) }
    }
  }
}

function keyOf(index: number) {
  return `k${index + 1}`
}
