import { distanceBetween, type Point } from "../point.ts"

type Dwell = { anchor: Point; target: unknown; since: number; fired: boolean }

export const createDwellDetector = (radius: number, durationMs: number) => {
  let dwell: Dwell | undefined

  return (point: Point | undefined, target: unknown, aspectRatio: number, now: number) => {
    if (!point || target === undefined) {
      dwell = undefined
      return false
    }

    if (!dwell || dwell.target !== target || distanceBetween(dwell.anchor, point, aspectRatio) > radius) {
      dwell = { anchor: point, target, since: now, fired: false }
    }

    if (dwell.fired || now - dwell.since < durationMs) return false

    dwell.fired = true
    return true
  }
}
