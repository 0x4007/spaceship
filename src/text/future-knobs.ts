import { centeredAt, type Point } from "../point.ts"
import { makeDraggable } from "./drag.ts"
import { circleOf, distance, linkBetween, pathOf } from "./links.ts"

type FutureKnobsOptions = {
  template: HTMLTemplateElement
  mainKnob: HTMLElement
  /** Draws a line from each future knob to `mainKnob`. */
  linkPath: SVGPathElement
}

/** Future knobs are draggable knobs linked to the main knob; double clicking one or dropping it onto the main knob deletes it. */
export function createFutureKnobs({ template, mainKnob, linkPath }: FutureKnobsOptions) {
  let knobs: HTMLElement[] = []

  return { spawn, clear, count: () => knobs.length, paintLinks }

  /** Adds a knob at `point` and hands it the pressed pointer, so it follows the pointer until release drops it. */
  function spawn(point: Point, pointerId: number) {
    const knob = template.content.firstElementChild!.cloneNode(true) as HTMLElement
    document.body.append(knob)
    knobs.push(knob)
    makeDraggable(knob, { onDrag: (point) => place(knob, point), onDrop: () => removeIfOnMain(knob) })
    knob.addEventListener("dblclick", () => remove(knob))
    place(knob, point)
    knob.setPointerCapture(pointerId)
  }

  function clear() {
    for (const knob of knobs) knob.remove()
    knobs = []
    paintLinks()
  }

  function remove(knob: HTMLElement) {
    knob.remove()
    knobs = knobs.filter((other) => other !== knob)
    paintLinks()
  }

  function removeIfOnMain(knob: HTMLElement) {
    const future = circleOf(knob)
    const main = circleOf(mainKnob)
    if (distance(future.center, main.center) < future.radius + main.radius) remove(knob)
  }

  function place(knob: HTMLElement, point: Point) {
    knob.style.translate = centeredAt(point, knob.offsetWidth)
    paintLinks()
  }

  function paintLinks() {
    const main = circleOf(mainKnob)
    linkPath.setAttribute("d", pathOf(knobs.map((knob) => linkBetween(circleOf(knob), main))))
  }
}
