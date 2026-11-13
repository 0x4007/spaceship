import type { Point } from "../point.ts"
import type { Lead } from "./attention.ts"
import { strengthLevelOf, optionIndexAt, valueOf, type Control, type Dimension, type DimensionSource } from "./dimension.ts"
import { makeDraggable } from "./drag.ts"
import { axisFor, visibleViewport } from "./fan-axis.ts"
import { hudNodesOf, STRENGTH_RANGE_PX, SWING_RADIANS } from "./future-hud.ts"
import { circleOf, linkBetween, pathOf } from "./links.ts"

const PENDING_VALUE = "…"
/** Distances beyond touching the main knob: nearer than the dead zone no dimension is a candidate; at the gate the candidate is chosen. */
const MENU_DEAD_ZONE_PX = 24
const MENU_GATE_PX = 96

type FutureKnobsOptions = {
  template: HTMLTemplateElement
  mainKnob: HTMLElement
  /** Draws each future knob's link, from the main knob's circumference to the knob's. */
  linkPath: SVGPathElement
  /** Draws the link of the knob being tuned, so the other links can dim. */
  tunedLinkPath: SVGPathElement
  /** Holds the rim and labels of the one knob being dragged or hovered. */
  hud: SVGGElement
  source: DimensionSource
  context: () => { text: string; leads: Lead[] }
  /** Called when a knob's setting (its value in words and strength level) changes. */
  onChange: () => void
}

/** Where a knob was last dragged to relative to the fan: `swing` is its angle from the axis and sets the value, `distance` from the main knob sets the strength. */
type Place = { swing: number; distance: number }

type Menu = { key: string; controller: AbortController; dimensions: Promise<Dimension[] | undefined> }

type FutureKnob = {
  element: HTMLElement
  label: HTMLElement
  /** Where the knob stays on the page, whatever the main knob does afterwards. */
  point: Point
  /** Read off when the knob is dragged, so its value and strength hold when the main knob moves away. */
  place: Place
  /** Offered while choosing; undefined until loaded. */
  menu?: Dimension[]
  /** The menu index the knob has stayed on since it left the dead zone. */
  candidate?: number
  /** How far the knob has travelled toward the gate while choosing, from 0 to 1. */
  progress: number
  /** The chosen dimension; a knob without one is choosing, one with it is tuning. */
  dimension?: Dimension
  setting?: string
  isDragging: boolean
  isHovered: boolean
  controller: AbortController
}

/**
 * Future knobs are draggable dials linked to the main knob; each tunes one dimension of the upcoming text.
 * A new knob first offers a menu of dimensions, one sector of the fan each, and carrying the knob through the gate chooses the one in its direction.
 * Then the knob's swing around the main knob picks the value and its distance sets the strength, until it is dropped: it stays there on the page and keeps its setting when the main knob moves.
 * Double clicking a knob or dropping it onto the main knob deletes it.
 */
export function createFutureKnobs({ template, mainKnob, linkPath, tunedLinkPath, hud, source, context, onChange }: FutureKnobsOptions) {
  let knobs: FutureKnob[] = []
  let preloaded: Menu | undefined
  let axis = 0

  return { preload, spawn, clear, count: () => knobs.length, layout, controls }

  /** Starts fetching the menu a new knob would get, unless one for the current context is already on its way. */
  function preload() {
    const key = keyOf()
    if (preloaded?.key === key) return
    preloaded?.controller.abort()
    const menu = fetchMenu(key)
    preloaded = menu
    menu.dimensions.then((dimensions) => {
      if (!dimensions && preloaded === menu) preloaded = undefined
    })
  }

  /** Adds a knob at `point` and hands it the pressed pointer, so it follows the pointer until release drops it. */
  function spawn(point: Point, pointerId: number) {
    const key = keyOf()
    if (preloaded?.key !== key) preloaded?.controller.abort()
    const menu = preloaded?.key === key ? preloaded : fetchMenu(key)
    preloaded = undefined

    const element = template.content.firstElementChild!.cloneNode(true) as HTMLElement
    const knob: FutureKnob = {
      element,
      label: element.querySelector("span")!,
      point,
      place: { swing: 0, distance: 0 },
      progress: 0,
      isDragging: true,
      isHovered: false,
      controller: menu.controller,
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
    updateAxis()
    drag(knob, point)
    element.setPointerCapture(pointerId)
    receiveMenu(knob, menu)
  }

  function clear() {
    const hadDimension = knobs.some((knob) => knob.dimension)
    knobs.forEach(dispose)
    knobs = []
    layout()
    if (hadDimension) onChange()
  }

  function layout() {
    const main = circleOf(mainKnob)
    const tuned = knobs.find((knob) => knob.isDragging)
    const shown = tuned ?? knobs.find((knob) => knob.isHovered)
    if (!tuned) updateAxis()
    let readout = ""
    for (const knob of knobs) {
      placeOnPage(knob, main.center)
      const text = show(knob)
      if (knob === shown) readout = text
      knob.label.hidden = knob === shown
      knob.element.toggleAttribute("data-dimmed", tuned !== undefined && knob !== tuned)
    }
    const linksOf = (linked: FutureKnob[]) => pathOf(linked.map((knob) => linkBetween(main, { center: knob.point, radius: knob.element.offsetWidth / 2 })))
    linkPath.setAttribute("d", linksOf(knobs.filter((knob) => knob !== tuned)))
    linkPath.toggleAttribute("data-dimmed", tuned !== undefined)
    tunedLinkPath.setAttribute("d", linksOf(tuned ? [tuned] : []))
    hud.replaceChildren(
      ...(shown
        ? hudNodesOf({
            center: main.center,
            rimRadius: shown.dimension ? rimRadiusOf(shown, main.radius) : minDistanceOf(shown, main.radius) + MENU_GATE_PX,
            axis,
            view: viewOf(shown),
            readout,
          })
        : []),
    )
  }

  function controls(): Control[] {
    return knobs.flatMap((knob) => (knob.dimension ? [{ dimension: knob.dimension, position: positionOf(knob), strength: strengthOf(knob) }] : []))
  }

  function keyOf() {
    return JSON.stringify([context(), takenOf().map(({ name }) => name)])
  }

  function takenOf() {
    return knobs.flatMap((knob) => (knob.dimension ? [knob.dimension] : []))
  }

  function fetchMenu(key: string): Menu {
    const controller = new AbortController()
    return { key, controller, dimensions: loadMenu(controller.signal) }
  }

  /** Undefined when the source fails or offers nothing; failures are logged here, so nobody has to handle a rejection. */
  async function loadMenu(signal: AbortSignal) {
    try {
      const dimensions = await Array.fromAsync(source({ ...context(), taken: takenOf() }, signal))
      if (signal.aborted) return
      if (!dimensions.length) throw new Error("the dimension source offered nothing")
      return dimensions
    } catch (error) {
      if (!signal.aborted) console.error(error)
    }
  }

  async function receiveMenu(knob: FutureKnob, { dimensions }: Menu) {
    const menu = await dimensions
    if (knob.controller.signal.aborted) return
    if (!menu) return remove(knob)
    knob.menu = menu
    updateCandidate(knob)
    layout()
  }

  function updateAxis() {
    const [first] = knobs
    if (!first) return
    const main = circleOf(mainKnob)
    axis = axisFor(main.center, rimRadiusOf(first, main.radius), visibleViewport())
  }

  function remove(knob: FutureKnob) {
    if (!knobs.includes(knob)) return
    dispose(knob)
    knobs = knobs.filter((other) => other !== knob)
    layout()
    if (knob.dimension) onChange()
  }

  function dispose({ element, controller }: FutureKnob) {
    element.remove()
    controller.abort()
  }

  function drag(knob: FutureKnob, point: Point) {
    const main = circleOf(mainKnob)
    const dx = point.x - main.center.x
    const dy = point.y - main.center.y
    knob.point = point
    knob.place = { swing: wrapped(Math.atan2(dx, dy) - axis), distance: Math.hypot(dx, dy) }
    updateCandidate(knob)
    layout()
    settle(knob)
  }

  function drop(knob: FutureKnob) {
    knob.isDragging = false
    if (!knobs.includes(knob)) return
    if (!knob.dimension || knob.place.distance < minDistanceOf(knob, circleOf(mainKnob).radius)) return remove(knob)
    layout()
  }

  /** While choosing, the dimension in the knob's direction is the candidate, and carrying the knob through the gate chooses it. */
  function updateCandidate(knob: FutureKnob) {
    if (knob.dimension) return
    const beyondTouching = knob.place.distance - minDistanceOf(knob, circleOf(mainKnob).radius)
    knob.candidate = knob.menu && beyondTouching >= MENU_DEAD_ZONE_PX ? optionIndexAt(knob.menu.length, positionOf(knob)) : undefined
    knob.progress = clamp01(beyondTouching / MENU_GATE_PX)
    if (knob.candidate !== undefined && beyondTouching >= MENU_GATE_PX) choose(knob, knob.menu![knob.candidate])
  }

  function choose(knob: FutureKnob, dimension: Dimension) {
    knob.dimension = dimension
    knob.candidate = undefined
    layout()
    settle(knob)
  }

  /** Reports a change only when what the text generator would see differs from the last report. */
  function settle(knob: FutureKnob) {
    const setting = knob.dimension && `${valueOf({ dimension: knob.dimension, position: positionOf(knob) })}|${strengthLevelOf(strengthOf(knob))}`
    if (setting === knob.setting) return
    knob.setting = setting
    onChange()
  }

  /** The label goes on the side away from the main knob, so it stays off the link. */
  function placeOnPage(knob: FutureKnob, origin: Point) {
    const size = knob.element.offsetWidth
    const { x, y } = knob.point
    knob.element.style.translate = `${x - size / 2}px ${y - size / 2}px`
    knob.element.dataset.side = x < origin.x ? "left" : "right"
  }

  /** Updates the knob's look and returns the text its HUD readout shows. */
  function show(knob: FutureKnob) {
    const { dimension } = knob
    if (!dimension) {
      knob.element.style.setProperty("--fill", `${knob.progress}`)
      knob.label.textContent = PENDING_VALUE
      knob.element.setAttribute("aria-label", `future knob, choosing a dimension, double click to delete`)
      return knob.menu && knob.candidate !== undefined ? previewOf(knob.menu[knob.candidate]) : knob.menu ? "" : PENDING_VALUE
    }
    const strength = strengthOf(knob)
    const label = `${dimension.name}: ${valueOf({ dimension, position: positionOf(knob) })}`
    knob.element.style.setProperty("--fill", `${strength}`)
    knob.label.textContent = label
    knob.element.setAttribute("aria-label", `future knob, ${label}, ${strengthLevelOf(strength)} influence, double click to delete`)
    return `${label} · ${Math.round(strength * 100)}%`
  }

  function viewOf(knob: FutureKnob) {
    if (knob.dimension) return { phase: "tuning" as const, dimension: knob.dimension, swing: clampedSwingOf(knob) }
    return { phase: "choosing" as const, names: knob.menu?.map(({ name }) => name) ?? [], candidate: knob.candidate }
  }

  function positionOf(knob: FutureKnob) {
    return clamp01((knob.place.swing + SWING_RADIANS) / (2 * SWING_RADIANS))
  }

  function strengthOf(knob: FutureKnob) {
    const min = minDistanceOf(knob, circleOf(mainKnob).radius)
    return clamp01((knob.place.distance - min) / STRENGTH_RANGE_PX)
  }

  function clampedSwingOf(knob: FutureKnob) {
    return positionOf(knob) * 2 * SWING_RADIANS - SWING_RADIANS
  }
}

function previewOf(dimension: Dimension) {
  const offer = dimension.kind === "scale" ? `${dimension.low} ↔ ${dimension.high}` : dimension.options.join(" · ")
  return `${dimension.name}: ${offer}`
}

function rimRadiusOf(knob: Pick<FutureKnob, "element">, mainRadius: number) {
  return minDistanceOf(knob, mainRadius) + STRENGTH_RANGE_PX
}

function minDistanceOf({ element }: Pick<FutureKnob, "element">, mainRadius: number) {
  return mainRadius + element.offsetWidth / 2
}

function wrapped(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}
