import type { Point } from "../point.ts"
import { pathOf } from "./links.ts"
import { optionIndexAt, type Dimension } from "./dimension.ts"

export const SWING_RADIANS = Math.PI / 3
export const STRENGTH_RANGE_PX = 200
const MARK_LENGTH_PX = 12
const LABEL_GAP_PX = 12
const READOUT_RISE_PX = 84
const DOT_RADIUS_PX = 5
const CENTERED_RADIANS = Math.PI / 18
const SVG_NS = "http://www.w3.org/2000/svg"

type HudOptions = {
  center: Point
  /** Where strength reaches 100%. */
  rimRadius: number
  /** Undefined while the dimension is pending: only the rim is drawn. */
  dimension?: Dimension
  /** The selected knob's angle from straight down, clamped to the fan. */
  swing: number
  /** The active knob's label, written inside the fan above the rim's lowest point. */
  readout: string
}

/** The rim, the values written beside it, and the selected value marked, as SVG nodes. */
export function hudNodesOf({ center, rimRadius, dimension, swing, readout }: HudOptions): SVGElement[] {
  const onRim = (angle: number, radius = rimRadius): Point => ({
    x: center.x + Math.sin(angle) * radius,
    y: center.y + Math.cos(angle) * radius,
  })
  const markAt = (angle: number): [Point, Point] => [onRim(angle, rimRadius - MARK_LENGTH_PX / 2), onRim(angle, rimRadius + MARK_LENGTH_PX / 2)]
  const labelAt = (angle: number, content: string, isSelected = false) => {
    const { x, y } = onRim(angle, rimRadius + LABEL_GAP_PX)
    const text = svg("text", { x, y, "text-anchor": anchorOf(angle), "dominant-baseline": Math.abs(angle) < CENTERED_RADIANS ? "hanging" : "middle" })
    text.textContent = content
    if (isSelected) text.dataset.selected = ""
    return text
  }

  const [left, right] = [onRim(-SWING_RADIANS), onRim(SWING_RADIANS)]
  const rim = svg("path", { d: `M${left.x},${left.y}A${rimRadius},${rimRadius} 0 0 0 ${right.x},${right.y}` })
  const readoutText = svg("text", { x: center.x, y: center.y + rimRadius - READOUT_RISE_PX, "text-anchor": "middle", "dominant-baseline": "middle" })
  readoutText.textContent = readout
  if (!dimension) return [rim, readoutText]

  if (dimension.kind === "scale") {
    const { x, y } = onRim(swing)
    const marker = svg("circle", { cx: x, cy: y, r: DOT_RADIUS_PX })
    return [rim, readoutText, marker, labelAt(-SWING_RADIANS, dimension.low), labelAt(SWING_RADIANS, dimension.high)]
  }

  const { options } = dimension
  const sector = (2 * SWING_RADIANS) / options.length
  const selected = optionIndexAt(options.length, (swing + SWING_RADIANS) / (2 * SWING_RADIANS))
  const boundaries = Array.from({ length: options.length - 1 }, (_, i) => markAt(-SWING_RADIANS + sector * (i + 1)))
  const labels = options.map((option, i) => labelAt(-SWING_RADIANS + sector * (i + 0.5), option, i === selected))
  return [rim, readoutText, svg("path", { d: pathOf(boundaries) }), ...labels]
}

function anchorOf(angle: number) {
  if (Math.abs(angle) < CENTERED_RADIANS) return "middle"
  return angle < 0 ? "end" : "start"
}

function svg(tag: string, attributes: Record<string, string | number>) {
  const element = document.createElementNS(SVG_NS, tag) as SVGElement
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, `${value}`)
  return element
}
