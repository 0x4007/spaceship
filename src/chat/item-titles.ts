import { FINGERS, fingertipOf, type Finger } from "../fingers.ts"
import type { Point } from "../point.ts"
import type { Surface } from "../tracking/overlay.ts"
import { createFallingTitles } from "./falling-titles.ts"
import type { ItemSlots } from "./item-slots.ts"

export function createItemTitles(slots: ItemSlots, surface: Surface) {
  const falling = createFallingTitles()

  return {
    draw(hand: Point[] | undefined, hiddenFingers: Set<Finger>, now: number) {
      FINGERS.forEach((finger) => {
        const item = slots.itemAt(finger)

        if (hand && item && !hiddenFingers.has(finger)) surface.label(item.title, hand[fingertipOf(finger)])
      })

      falling.positions(now).forEach(({ title, point }) => surface.label(title, point))
    },

    shakeOff(hand: Point[], now: number) {
      falling.drop(
        FINGERS.flatMap((finger) => {
          const item = slots.itemAt(finger)

          return item ? [{ title: item.title, origin: hand[fingertipOf(finger)] }] : []
        }),
        now,
      )
    },
  }
}
