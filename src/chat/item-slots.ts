import { FINGERS, type Finger } from "../content.ts"
import type { Item } from "./items.ts"

export function createItemSlots() {
  const slotted = new Map<Finger, number>()
  let items: Item[] = []
  let nextIndex = 0

  return {
    itemAt: (finger: Finger) => items[slotted.get(finger) ?? -1],

    sync(streamed: Item[]) {
      items = streamed
      fill()
    },

    take(finger: Finger) {
      slotted.delete(finger)
      fill()
    },

    reset() {
      slotted.clear()
      items = []
      nextIndex = 0
    },
  }

  function fill() {
    for (const finger of FINGERS) {
      if (slotted.has(finger)) continue
      if (nextIndex >= items.length) return

      slotted.set(finger, nextIndex++)
    }
  }
}
