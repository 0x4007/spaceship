import type { Point } from "../point.ts"
import { pathOf } from "./links.ts"
import { optionIndexAt, type Dimension } from "./dimension.ts"

export const SWING_RADIANS = Math.PI / 3
export const STRENGTH_RANGE_PX = 200
const MARK_LENGTH_PX = 12
const LABEL_GAP_PX = 12
const LINE_HEIGHT_PX = 24
const DOT_RADIUS_PX = 5
const CENTERED_RADIANS = Math.PI / 18
/** How far the backdrop reaches past the fan: beyond the rim, and to each side. */
const BACKDROP_REACH_PX = 110
const BACKDROP_REACH_RADIANS = Math.PI / 7
const SVG_NS = "http://www.w3.org/2000/svg"

let context: CanvasRenderingContext2D | undefined

type HudView =
  /** Tier 1: the menu's dimension names, none while it loads. */
  | { phase: "choosing"; names: string[]; candidate?: number }
  /** Tier 2: `swing` is the knob's angle from the axis, clamped to the fan. */
  | { phase: "tuning"; dimension: Dimension; swing: number }

type HudOptions = {
  center: Point
  /** While tuning, where strength reaches 100%; while choosing, the gate that chooses the candidate carried through it. */
  rimRadius: number
  /** The fan's direction as an angle of deviation from straight down. */
  axis: number
  view: HudView
  /** The active knob's text, written on the axis beyond the values. */
  readout: string
}

/** A page-colored backdrop that hides whatever lies under the fan, then the rim, the names or values written beside it, and the selected value marked, as SVG nodes. */
export function hudNodesOf({ center, rimRadius, axis, view, readout }: HudOptions): SVGElement[] {
  const onFan = (swing: number, radius = rimRadius): Point => ({
    x: center.x + Math.sin(axis + swing) * radius,
    y: center.y + Math.cos(axis + swing) * radius,
  })
  const markAt = (swing: number): [Point, Point] => [onFan(swing, rimRadius - MARK_LENGTH_PX / 2), onFan(swing, rimRadius + MARK_LENGTH_PX / 2)]
  const textAt = (swing: number, radius: number, content: string, isLabel: boolean, isSelected = false) => {
    const { x, y } = onFan(swing, radius)
    const across = Math.sin(axis + swing)
    const isCentered = Math.abs(across) < Math.sin(CENTERED_RADIANS)
    const text = svg("text", {
      x,
      y,
      "text-anchor": isCentered ? "middle" : across < 0 ? "end" : "start",
      "dominant-baseline": isCentered && isLabel ? (Math.cos(axis + swing) > 0 ? "hanging" : "text-after-edge") : "middle",
    })
    text.textContent = content
    if (isSelected) text.dataset.selected = ""
    return text
  }
  const labelAt = (swing: number, content: string, isSelected = false) => textAt(swing, rimRadius + LABEL_GAP_PX, content, true, isSelected)
  const boundariesOf = (count: number) =>
    svg("path", { d: pathOf(Array.from({ length: count - 1 }, (_, i) => markAt(-SWING_RADIANS + sectorOf(count) * (i + 1)))) })

  const backdropRadius = rimRadius + BACKDROP_REACH_PX
  const backdropSwing = SWING_RADIANS + BACKDROP_REACH_RADIANS
  const [left, right] = [onFan(-SWING_RADIANS), onFan(SWING_RADIANS)]
  const rim = svg("path", { d: `M${left.x},${left.y}A${rimRadius},${rimRadius} 0 0 0 ${right.x},${right.y}` })
  const backdrop = svg("path", { d: sectorPath(center, onFan(-backdropSwing, backdropRadius), onFan(backdropSwing, backdropRadius), backdropRadius) })
  backdrop.dataset.backdrop = ""
  const readoutText = (labels: string[]) => textAt(0, rimRadius + LABEL_GAP_PX + labelDepthOf(labels, axis) + LABEL_GAP_PX, readout, false)

  if (view.phase === "choosing") {
    rim.dataset.dashed = ""
    const { names, candidate } = view
    const labels = names.map((name, i) => labelAt(-SWING_RADIANS + sectorOf(names.length) * (i + 0.5), name, i === candidate))
    return [backdrop, rim, readoutText(names), ...(names.length ? [boundariesOf(names.length)] : []), ...labels]
  }

  const { dimension, swing } = view
  if (dimension.kind === "scale") {
    const { x, y } = onFan(swing)
    const marker = svg("circle", { cx: x, cy: y, r: DOT_RADIUS_PX })
    return [backdrop, rim, readoutText([dimension.low, dimension.high]), marker, labelAt(-SWING_RADIANS, dimension.low), labelAt(SWING_RADIANS, dimension.high)]
  }

  const { options } = dimension
  const selected = optionIndexAt(options.length, (swing + SWING_RADIANS) / (2 * SWING_RADIANS))
  const labels = options.map((option, i) => labelAt(-SWING_RADIANS + sectorOf(options.length) * (i + 0.5), option, i === selected))
  return [backdrop, rim, readoutText(options), boundariesOf(options.length), ...labels]
}

/** How far the labels reach beyond the rim along the axis: a line's height when it points up or down, the widest label's width when sideways. */
function labelDepthOf(labels: string[], axis: number) {
  const widest = Math.max(0, ...labels.map(widthOf))
  return LINE_HEIGHT_PX * Math.abs(Math.cos(axis)) + (widest + LABEL_GAP_PX) * Math.abs(Math.sin(axis))
}

function widthOf(content: string) {
  context ??= document.createElement("canvas").getContext("2d")!
  context.font = getComputedStyle(document.body).font
  return context.measureText(content).width
}

function sectorOf(count: number) {
  return (2 * SWING_RADIANS) / count
}

function svg(tag: string, attributes: Record<string, string | number>) {
  const element = document.createElementNS(SVG_NS, tag) as SVGElement
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, `${value}`)
  return element
}

function sectorPath(center: Point, from: Point, to: Point, radius: number) {
  return `M${center.x},${center.y}L${from.x},${from.y}A${radius},${radius} 0 0 0 ${to.x},${to.y}Z`
}
