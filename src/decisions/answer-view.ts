import type { Answer, DecisionResponse } from "../llm/decisions.ts"

type Row = { label: string; probability: number; top: boolean }

export function renderAnswers(container: HTMLElement, response: DecisionResponse, threshold: number) {
  container.replaceChildren(...Object.entries(response.answers).map(([key, answer]) => renderAnswer(key, answer, threshold)))
}

export function renderUsage(list: HTMLDListElement, response: DecisionResponse, milliseconds: number) {
  const { usage } = response
  const entries: [string, string | number][] = [
    ["latency", `${Math.round(milliseconds)} ms`],
    ...usage.input_tokens_by_modality.map(({ modality, tokens }): [string, number] => [`${modality.toLowerCase()} tokens`, tokens]),
    ["input tokens", usage.total_input_tokens],
    ["output tokens", usage.total_output_tokens],
    ["total tokens", usage.total_tokens],
  ]
  list.replaceChildren(...entries.flatMap(([term, value]) => [element("dt", term), element("dd", String(value))]))
}

function renderAnswer(key: string, answer: Answer, threshold: number) {
  const article = document.createElement("article")
  const action = answer.confidence >= threshold ? "automate" : "escalate"
  const table = document.createElement("table")

  table.append(...rows(answer).map(renderRow))
  article.append(element("h3", `${key} (${answer.type}) → ${headline(answer)}`), element("p", `confidence ${answer.confidence.toFixed(3)} → ${action}`), table)
  return article
}

function renderRow({ label, probability, top }: Row) {
  const row = document.createElement("tr")
  const meter = Object.assign(document.createElement("meter"), { value: probability })
  row.append(element("td", top ? "▶" : ""), element("td", label), element("td", probability.toFixed(3)))
  row.insertCell().append(meter)
  return row
}

function element(tag: string, text: string) {
  return Object.assign(document.createElement(tag), { textContent: text })
}

function headline(answer: Answer) {
  if (answer.type === "noul") return `yes ${answer.noul.toFixed(3)}`
  if (answer.type === "choice") return answer.choice
  const levels = Object.keys(answer.legend).length
  const topLevel = topKey(answer.probabilities)
  return `score ${answer.score.toFixed(2)} / ${levels - 1} (normalized ${(answer.score / (levels - 1)).toFixed(2)}), top level ${topLevel}: ${answer.legend[topLevel]}`
}

function rows(answer: Answer): Row[] {
  if (answer.type === "noul") {
    return [
      { label: "yes", probability: answer.noul, top: answer.noul >= 0.5 },
      { label: "no", probability: 1 - answer.noul, top: answer.noul < 0.5 },
    ]
  }
  const top = topKey(answer.probabilities)
  const labelOf = (key: string) => (answer.type === "score" ? `${key}: ${answer.legend[key]}` : key)
  const entries = Object.entries(answer.probabilities).map(([key, probability]) => ({ label: labelOf(key), probability, top: key === top }))
  return answer.type === "choice" ? entries.sort((a, b) => b.probability - a.probability) : entries
}

function topKey(probabilities: Record<string, number>) {
  return Object.entries(probabilities).reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0]
}
