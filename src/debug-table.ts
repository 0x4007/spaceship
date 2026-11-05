import { $$ } from "./dom.ts"
import type { Pinch } from "./interaction/pinch.ts"

type Readings = { pinching: Map<string, Pinch>; openness: Map<string, number>; roll: Map<string, number>; indexInPalm: Map<string, boolean> }

export function showDebug({ pinching, openness, roll, indexInPalm }: Readings) {
  $$<HTMLTableRowElement>("tr[data-hand]").forEach((row) => {
    const hand = row.dataset.hand!
    const pinch = pinching.get(hand)
    const degrees = roll.get(hand)
    const fields = {
      pinching: pinch ? `${pinch.active ? "yes" : "no"} (${pinch.confidence.toFixed(2)})` : "—",
      openness: openness.get(hand)?.toFixed(2) ?? "—",
      roll: degrees === undefined ? "—" : `${degrees.toFixed(0)}°`,
      palm: indexInPalm.has(hand) ? (indexInPalm.get(hand) ? "yes" : "no") : "—",
    }

    Object.entries(fields).forEach(([field, text]) => (row.querySelector(`[data-field=${field}]`)!.textContent = text))
  })
}
