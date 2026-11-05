import type { Finger } from "./content.ts"

type Point = { x: number; y: number }
type Title = { length: number; progress: number }
type Retraction = {
  text: string
  origin: Point
  anchor: Point
  followHand?: string
  title?: Title
  finger?: Finger
  startedAt: number
}

const DURATION_MS = 200

export function createRetractions() {
  let active: Retraction[] = []

  return {
    start(retraction: Omit<Retraction, "startedAt">, now: number) {
      active.push({ ...retraction, startedAt: now })
    },

    segments(now: number, midpoints: Map<string, Point>) {
      active = active.filter(({ startedAt }) => now - startedAt < DURATION_MS)

      return active.map(({ text, origin, anchor, followHand, title, finger, startedAt }) => {
        const fixed = (followHand && midpoints.get(followHand)) || anchor
        const elapsed = (now - startedAt) / DURATION_MS

        return {
          text,
          finger,
          anchor: fixed,
          end: lerp(origin, fixed, elapsed),
          title: title && { length: title.length, progress: title.progress * (1 - elapsed) },
        }
      })
    },
  }
}

const lerp = (from: Point, to: Point, t: number) => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t })
