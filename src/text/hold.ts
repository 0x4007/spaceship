import type { Point } from "../point.ts"

const STILL_TOLERANCE_PX = 4

/** Calls `onHold` once the pointer has stayed pressed and still on `element` for `ms`; moving restarts the wait. */
export function onPressAndHold(element: HTMLElement, ms: number, onHold: () => void) {
  let timer: number | undefined
  let anchor: Point | undefined

  element.addEventListener("pointerdown", ({ pageX, pageY }) => restart({ x: pageX, y: pageY }))
  element.addEventListener("pointermove", ({ pageX, pageY }) => {
    if (anchor && Math.hypot(pageX - anchor.x, pageY - anchor.y) > STILL_TOLERANCE_PX) restart({ x: pageX, y: pageY })
  })
  element.addEventListener("pointerup", cancel)
  element.addEventListener("pointercancel", cancel)

  function restart(point: Point) {
    clearTimeout(timer)
    anchor = point
    timer = setTimeout(() => {
      anchor = undefined
      onHold()
    }, ms)
  }

  function cancel() {
    clearTimeout(timer)
    anchor = undefined
  }
}
