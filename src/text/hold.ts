import { circleOf, distance } from "./links.ts"

const STILL_TOLERANCE_PX = 4
/** Keeps a slow click from flashing the start of the sweep. */
const SWEEP_DELAY_MS = 100

/**
 * Calls `onHold` with the latest pointer event once a press on `element` stays still for `SWEEP_DELAY_MS` plus `ms`, sweeping `--fill` on `element` from 0 to 1 over the `ms`.
 * Moving more than `STILL_TOLERANCE_PX` before the sweep, or leaving the element's circle during it, or releasing cancels the hold; a cancelled press can't hold again.
 * `hasSweepStarted` tells whether the current press got past the delay, so it can stop counting as a drag even after a cancel.
 */
export function onPressAndHold(element: HTMLElement, ms: number, onHold: (press: PointerEvent) => void) {
  let press: { start: PointerEvent; latest: PointerEvent; controller: AbortController } | undefined
  let hasSweepStarted = false

  element.addEventListener("pointerdown", (event) => {
    release()
    hasSweepStarted = false
    press = { start: event, latest: event, controller: new AbortController() }
    sweep(press)
  })
  element.addEventListener("pointermove", (event) => {
    if (!press) return
    press.latest = event
    const { start } = press
    const { center, radius } = hasSweepStarted ? circleOf(element) : { center: { x: start.pageX, y: start.pageY }, radius: STILL_TOLERANCE_PX }
    if (distance({ x: event.pageX, y: event.pageY }, center) > radius) release()
  })
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) element.addEventListener(type, release)

  return { hasSweepStarted: () => hasSweepStarted }

  async function sweep(held: NonNullable<typeof press>) {
    const { signal } = held.controller
    for await (const fill of fillProgress(ms, signal, SWEEP_DELAY_MS)) {
      if (fill > 0) hasSweepStarted = true
      element.style.setProperty("--fill", `${fill}`)
    }
    element.style.removeProperty("--fill")
    if (!signal.aborted) onHold(held.latest)
  }

  function release() {
    press?.controller.abort()
    press = undefined
  }
}

/** Yields progress once per animation frame, staying at 0 for `delayMs` then reaching 1 over `ms`; stops early once `signal` aborts. */
async function* fillProgress(ms: number, signal: AbortSignal, delayMs = 0) {
  const start = performance.now() + delayMs
  let fill = 0
  while (fill < 1) {
    const now = await new Promise<number>((resolve) => requestAnimationFrame(resolve))
    if (signal.aborted) return
    fill = Math.min(1, Math.max(0, (now - start) / ms))
    yield fill
  }
}
