import { lerp, subtract, type Point } from "../point.ts"

type Particle = { word: string; startedAt: number }

const TRAVEL_MS = 200
const EMIT_INTERVAL_MS = 110

export function createTranscriptFlow() {
  let particles: Particle[] = []
  let pending: string[] = []
  let emitted = 0
  let nextEmitAt = 0

  return {
    push(text: string, final = false) {
      const words = text.split(/\s+/).filter(Boolean)
      const settled = final || /\s$/.test(text) ? words : words.slice(0, -1)

      pending.push(...settled.slice(emitted))
      emitted = Math.max(emitted, settled.length)
    },

    reset() {
      particles = []
      pending = []
      emitted = 0
    },

    words(now: number, path?: Point[]) {
      while (pending.length && nextEmitAt <= now) {
        particles.push({ word: pending.shift()!, startedAt: nextEmitAt })
        nextEmitAt += EMIT_INTERVAL_MS
      }
      if (!pending.length) nextEmitAt = now

      particles = particles.filter(({ startedAt }) => now - startedAt < TRAVEL_MS)
      if (!path) return []

      return particles.map(({ word, startedAt }) => {
        const progress = (now - startedAt) / TRAVEL_MS

        return { word, ...along(path, progress), opacity: 1 - progress ** 2 }
      })
    },
  }
}

function along(path: Point[], progress: number) {
  const segments = path.slice(1).map((end, index) => ({ start: path[index], end, length: Math.hypot(end.x - path[index].x, end.y - path[index].y) }))
  let remaining = progress * segments.reduce((sum, { length }) => sum + length, 0)

  for (const { start, end, length } of segments) {
    if (remaining <= length) return { position: lerp(start, end, length ? remaining / length : 0), direction: subtract(end, start) }
    remaining -= length
  }

  const { start, end } = segments.at(-1)!

  return { position: end, direction: subtract(end, start) }
}
