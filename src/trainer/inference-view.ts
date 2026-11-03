import type { TrainedGesture } from "../gesture/training.ts"

const HANDS = ["Left", "Right"]

export function createInferenceView(tbody: HTMLTableSectionElement) {
  let rows: ReturnType<typeof createRow>[] = []

  return {
    show(gestures: TrainedGesture[]) {
      rows = gestures.map(createRow)
      tbody.replaceChildren(...rows.map(({ element }) => element))
    },

    update: (scoresByHand: Map<string, Record<string, number>>) =>
      rows.forEach(({ name, cells }) =>
        HANDS.forEach((hand) => {
          const score = scoresByHand.get(hand)?.[name]

          cells[hand].meter.value = score ?? 0
          cells[hand].output.value = score === undefined ? "—" : score.toFixed(2)
        }),
      ),
  }
}

function createRow({ name, validation }: TrainedGesture) {
  const cells = Object.fromEntries(
    HANDS.map((hand) => [
      hand,
      { meter: Object.assign(document.createElement("meter"), { max: 1 }), output: Object.assign(document.createElement("output"), { value: "—" }) },
    ]),
  )

  const element = document.createElement("tr")
  const header = Object.assign(document.createElement("th"), { scope: "row", textContent: name })
  const scoreCells = HANDS.map((hand) => {
    const cell = document.createElement("td")

    cell.append(cells[hand].meter, " ", cells[hand].output)

    return cell
  })
  const accuracy = Object.assign(document.createElement("td"), {
    textContent: validation ? `${(validation.accuracy * 100).toFixed(0)}% (${validation.samples} samples)` : "not enough samples",
  })

  element.append(header, ...scoreCells, accuracy)

  return { name, element, cells }
}
