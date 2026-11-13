import type { Point } from "../gesture/geometry.ts"

/**
 * Tuning order
 *
 * Set BETA = 0 and adjust MIN_CUTOFF until the still hand is acceptably steady.
 * Then raise BETA until fast movements stop lagging.
 */
const MIN_CUTOFF = 5
const BETA = 10
const DERIVATIVE_CUTOFF = 1

export function createHandFilter() {
  const filters = new Map<string, ReturnType<typeof createOneEuroFilter>>()

  const filterAxis = (key: string, value: number, seconds: number) => {
    if (!filters.has(key)) filters.set(key, createOneEuroFilter())

    return filters.get(key)!(value, seconds)
  }

  return (hands: Point[][], labels: string[], seconds: number) => {
    filters.forEach((_, key) => labels.includes(key.split(":")[0]) || filters.delete(key))

    return hands.map((points, handIndex) =>
      points.map((point, index) => {
        const prefix = `${labels[handIndex]}:${index}`

        return {
          x: filterAxis(`${prefix}:x`, point.x, seconds),
          y: filterAxis(`${prefix}:y`, point.y, seconds),
          z: filterAxis(`${prefix}:z`, point.z, seconds),
        }
      }),
    )
  }
}

function createOneEuroFilter() {
  let previous: { seconds: number; value: number; derivative: number } | undefined

  return (value: number, seconds: number) => {
    if (!previous || seconds <= previous.seconds) {
      previous = { seconds, value, derivative: 0 }

      return value
    }

    const elapsed = seconds - previous.seconds
    const rawDerivative = (value - previous.value) / elapsed
    const derivative = lowPass(rawDerivative, previous.derivative, smoothing(elapsed, DERIVATIVE_CUTOFF))
    const cutoff = MIN_CUTOFF + BETA * Math.abs(derivative)
    const filtered = lowPass(value, previous.value, smoothing(elapsed, cutoff))

    previous = { seconds, value: filtered, derivative }

    return filtered
  }
}

const smoothing = (elapsed: number, cutoff: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff) / elapsed)

const lowPass = (value: number, previous: number, alpha: number) => alpha * value + (1 - alpha) * previous
