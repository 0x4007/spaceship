import type { Point } from "../point.ts"

/** Space between the column, a knob, its label and the page edge; and between stacked pins. */
const GAP_PX = 8

export type Side = "left" | "right"

/** A knob to pin beside the column, level with `anchor`: the page point of its sentence's first character. */
export type MarginPin = { anchor: Point; element: HTMLElement; label: HTMLElement }

/**
 * Places each pin in the margin on the side nearer its anchor, with its label wrapped to fit the margin, and stacks pins downward so they never overlap.
 * `column` is the text column's page box. Returns each pin's knob center and side, in order.
 */
export function placeInMargins(pins: MarginPin[], column: { left: number; right: number }): { point: Point; side: Side }[] {
  const pageWidth = document.documentElement.clientWidth + scrollX
  const middle = (column.left + column.right) / 2
  const placed = pins.map((pin) => ({ pin, side: (pin.anchor.x < middle ? "left" : "right") as Side, point: pin.anchor }))

  for (const side of ["left", "right"] as const) {
    let bottom = -Infinity
    const stack = placed.filter((entry) => entry.side === side).sort((a, b) => a.pin.anchor.y - b.pin.anchor.y)
    for (const entry of stack) {
      const { element, label, anchor } = entry.pin
      const size = element.offsetWidth
      const room = (side === "left" ? column.left : pageWidth - column.right) - size - 4 * GAP_PX
      label.style.maxWidth = `${Math.max(0, room)}px`
      const height = Math.max(size, label.offsetHeight)
      const y = Math.max(anchor.y, bottom + GAP_PX + height / 2)
      bottom = y + height / 2
      entry.point = { x: side === "left" ? column.left - GAP_PX - size / 2 : column.right + GAP_PX + size / 2, y }
    }
  }
  return placed.map(({ point, side }) => ({ point, side }))
}
