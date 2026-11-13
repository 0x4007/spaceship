import type { Point } from "../point.ts"
import type { Lead } from "./attention.ts"
import { optionIndexAt, strengthLevelOf, valueOf, type Control, type Dimension, type DimensionContext, type DimensionSource } from "./dimension.ts"
import { makeDraggable } from "./drag.ts"
import { hudNodesOf, STRENGTH_RANGE_PX, SWING_RADIANS } from "./future-hud.ts"
import { circleOf, linkBetween, pathOf } from "./links.ts"

const PENDING_VALUE = "…"

type FutureKnobsOptions = {
  template: HTMLTemplateElement
  mainKnob: HTMLElement
  /** Draws each future knob's link, from the main knob's circumference to the knob's. */
  linkPath: SVGPathElement
  /** Draws the link of the knob being tuned, so the other links can dim. */
  tunedLinkPath: SVGPathElement
  /** Holds the rim and value labels of the one knob being dragged or hovered. */
  hud: SVGGElement
  source: DimensionSource
  context: () => { text: string; leads: Lead[] }
  /** Called when a knob's setting (its value in words and strength level) changes. */
  onChange: () => void
}

type Polar = { angle: number; distance: number }

type FutureKnob = {
  element: HTMLElement
  label: HTMLElement
  polar: Polar
  dimension?: Dimension
  setting?: string
  isDragging: boolean
  isHovered: boolean
  controller: AbortController
}

/**
 * Future knobs are draggable dials linked to the main knob; each tunes one dimension of the upcoming text.
 * The knob's swing around the main knob picks the value and its distance sets the strength.
 * Double clicking a knob or dropping it onto the main knob deletes it.
 */
export function createFutureKnobs({ template, mainKnob, linkPath, tunedLinkPath, hud, source, context, onChange }: FutureKnobsOptions) {
  let knobs: FutureKnob[] = []

  return { spawn, clear, count: () => knobs.length, layout, controls }

  /** Adds a knob at `point` and hands it the pressed pointer, so it follows the pointer until release drops it. */
  function spawn(point: Point, pointerId: number) {
    const element = template.content.firstElementChild!.cloneNode(true) as HTMLElement
    const knob: FutureKnob = {
      element,
      label: element.querySelector("span")!,
      polar: { angle: 0, distance: 0 },
      isDragging: true,
      isHovered: false,
      controller: new AbortController(),
    }
    document.body.append(element)
    knobs.push(knob)
    makeDraggable(element, {
      onStart: () => ((knob.isDragging = true), true),
      onDrag: (point) => drag(knob, point),
      onDrop: () => drop(knob),
    })
    element.addEventListener("dblclick", () => remove(knob))
    element.addEventListener("pointerenter", () => ((knob.isHovered = true), layout()))
    element.addEventListener("pointerleave", () => ((knob.isHovered = false), layout()))
    drag(knob, point)
    element.setPointerCapture(pointerId)
    requestDimension(knob)
  }

  function clear() {
    const hadDimension = knobs.some((knob) => knob.dimension)
    for (const knob of knobs) (knob.element.remove(), knob.controller.abort())
    knobs = []
    layout()
    if (hadDimension) onChange()
  }

  function layout() {
    const main = circleOf(mainKnob)
    const tuned = knobs.find((knob) => knob.isDragging)
    const shown = tuned ?? knobs.find((knob) => knob.isHovered)
    let readout = ""
    for (const knob of knobs) {
      place(knob, main.center)
      const text = show(knob, knob === shown)
      if (knob === shown) readout = text
      knob.element.toggleAttribute("data-dimmed", tuned !== undefined && knob !== tuned)
    }
    const linksOf = (linked: FutureKnob[]) =>
      pathOf(linked.map((knob) => linkBetween(main, { center: centerOf(knob, main.center), radius: knob.element.offsetWidth / 2 })))
    linkPath.setAttribute("d", linksOf(knobs.filter((knob) => knob !== tuned)))
    linkPath.toggleAttribute("data-dimmed", tuned !== undefined)
    tunedLinkPath.setAttribute("d", linksOf(tuned ? [tuned] : []))
    hud.replaceChildren(
      ...(shown
        ? hudNodesOf({
            center: main.center,
            rimRadius: minDistanceOf(shown, main.radius) + STRENGTH_RANGE_PX,
            dimension: shown.dimension,
            swing: clampedSwingOf(shown),
            readout,
          })
        : []),
    )
  }

  function controls(): Control[] {
    return knobs.flatMap((knob) => (knob.dimension ? [{ dimension: knob.dimension, position: positionOf(knob), strength: strengthOf(knob) }] : []))
  }

  async function requestDimension(knob: FutureKnob) {
    const taken = knobs.flatMap((other) => (other !== knob && other.dimension ? [other.dimension] : []))
    const request: DimensionContext = { ...context(), taken }
    try {
      const dimension = await source(request, knob.controller.signal)
      if (knob.controller.signal.aborted) return
      knob.dimension = dimension
      layout()
      settle(knob)
    } catch (error) {
      if (knob.controller.signal.aborted) return
      console.error(error)
      remove(knob)
    }
  }

  function remove(knob: FutureKnob) {
    if (!knobs.includes(knob)) return
    knob.element.remove()
    knob.controller.abort()
    knobs = knobs.filter((other) => other !== knob)
    layout()
    if (knob.dimension) onChange()
  }

  function drag(knob: FutureKnob, point: Point) {
    const main = circleOf(mainKnob)
    const dx = point.x - main.center.x
    const dy = point.y - main.center.y
    knob.polar = { angle: Math.atan2(dy, dx), distance: Math.hypot(dx, dy) }
    layout()
    settle(knob)
  }

  function drop(knob: FutureKnob) {
    knob.isDragging = false
    if (!knobs.includes(knob)) return
    if (knob.polar.distance < minDistanceOf(knob, circleOf(mainKnob).radius)) return remove(knob)
    layout()
  }

  /** Reports a change only when what the text generator would see differs from the last report. */
  function settle(knob: FutureKnob) {
    const setting = knob.dimension && `${valueOf({ dimension: knob.dimension, position: positionOf(knob) })}|${strengthLevelOf(strengthOf(knob))}`
    if (setting === knob.setting) return
    knob.setting = setting
    onChange()
  }

  /** The label goes on the side away from the main knob, so it stays off the link. */
  function place({ element, polar }: FutureKnob, origin: Point) {
    const size = element.offsetWidth
    const x = origin.x + Math.cos(polar.angle) * polar.distance - size / 2
    const y = origin.y + Math.sin(polar.angle) * polar.distance - size / 2
    element.style.translate = `${x}px ${y}px`
    element.dataset.side = Math.cos(polar.angle) < 0 ? "left" : "right"
  }

  /** Updates the knob's look and returns the text its HUD readout shows. */
  function show(knob: FutureKnob, isHudShown: boolean) {
    const { dimension } = knob
    const strength = dimension ? strengthOf(knob) : 0
    const value = dimension ? valueOf({ dimension, position: positionOf(knob) }) : PENDING_VALUE
    const label = dimension ? `${dimension.name}: ${value}` : PENDING_VALUE
    const [fillFrom, fill] = dimension ? fillOf(dimension, positionOf(knob), strength) : [0, 0]
    knob.element.style.setProperty("--fill-from", `${fillFrom}`)
    knob.element.style.setProperty("--fill", `${fill}`)
    knob.label.textContent = label
    knob.label.hidden = isHudShown
    const spoken = dimension ? `${label}, ${strengthLevelOf(strength)} influence` : label
    knob.element.setAttribute("aria-label", `future knob, ${spoken}, double click to delete`)
    return dimension ? `${label} · ${Math.round(strength * 100)}%` : label
  }

  function centerOf({ polar }: FutureKnob, origin: Point): Point {
    return { x: origin.x + Math.cos(polar.angle) * polar.distance, y: origin.y + Math.sin(polar.angle) * polar.distance }
  }

  function positionOf(knob: FutureKnob) {
    return clamp01((swingOf(knob) + SWING_RADIANS) / (2 * SWING_RADIANS))
  }

  function strengthOf(knob: FutureKnob) {
    const min = minDistanceOf(knob, circleOf(mainKnob).radius)
    return clamp01((knob.polar.distance - min) / STRENGTH_RANGE_PX)
  }

  function clampedSwingOf(knob: FutureKnob) {
    return positionOf(knob) * 2 * SWING_RADIANS - SWING_RADIANS
  }
}

/** `[start, size]` of the knob's black sector in turns: a scale fills up with its strength; a choice shows the selected option's slice, one of as many equal slices as it has options. */
function fillOf(dimension: Dimension, position: number, strength: number): [number, number] {
  if (dimension.kind === "scale") return [0, strength]
  const count = dimension.options.length
  return [optionIndexAt(count, position) / count, 1 / count]
}

/** Angle from straight down below the main knob: negative to the left, positive to the right. */
function swingOf({ polar }: FutureKnob) {
  return Math.atan2(Math.cos(polar.angle), Math.sin(polar.angle))
}

function minDistanceOf({ element }: Pick<FutureKnob, "element">, mainRadius: number) {
  return mainRadius + element.offsetWidth / 2
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}
