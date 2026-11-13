import type { Point } from "../point.ts"

export function makeDraggable(element: HTMLElement, onDrag: (point: Point) => void, onDrop?: () => void) {
  element.addEventListener("pointerdown", ({ pointerId }) => element.setPointerCapture(pointerId))
  element.addEventListener("pointermove", ({ pointerId, pageX, pageY }) => {
    if (element.hasPointerCapture(pointerId)) onDrag({ x: pageX, y: pageY })
  })
  if (onDrop) element.addEventListener("lostpointercapture", onDrop)
}
