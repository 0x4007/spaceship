type Point = { x: number; y: number }
type Retraction = { text: string; origin: Point; anchor: Point; followHand?: string; startedAt: number }

const DURATION_MS = 200

export function createRetractions() {
  let active: Retraction[] = []

  return {
    start(retraction: Omit<Retraction, "startedAt">, now: number) {
      active.push({ ...retraction, startedAt: now })
    },

    segments(now: number, midpoints: Map<string, Point>) {
      active = active.filter(({ startedAt }) => now - startedAt < DURATION_MS)

      return active.map(({ text, origin, anchor, followHand, startedAt }) => {
        const fixed = (followHand && midpoints.get(followHand)) || anchor

        return { text, anchor: fixed, end: lerp(origin, fixed, (now - startedAt) / DURATION_MS) }
      })
    },
  }
}

const lerp = (from: Point, to: Point, t: number) => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t })
