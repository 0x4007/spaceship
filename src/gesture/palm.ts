import type { Point } from "./geometry.ts"
import { INDEX_TIP, PALM_OUTLINE } from "./landmarks.ts"

export const palmCenter = (hand: Point[]) => ({
  x: average(PALM_OUTLINE.map((landmark) => hand[landmark].x)),
  y: average(PALM_OUTLINE.map((landmark) => hand[landmark].y)),
})

export const indexTipsInPalms = (landmarks: Point[][], labels: string[], aspectRatio: number) =>
  new Map(
    labels.map((label, index) => {
      const tip = landmarks[index][INDEX_TIP]
      const other = landmarks[1 - index]

      return [
        label,
        !!other &&
          insidePolygon(
            tip,
            PALM_OUTLINE.map((landmark) => other[landmark]),
            aspectRatio,
          ),
      ]
    }),
  )

function insidePolygon(point: Point, polygon: Point[], aspectRatio: number) {
  const scaled = (p: Point) => ({ x: p.x * aspectRatio, y: p.y })
  const target = scaled(point)
  const vertices = polygon.map(scaled)

  return vertices.reduce((inside, a, index) => {
    const b = vertices[(index + 1) % vertices.length]
    const crosses = a.y > target.y !== b.y > target.y && target.x < ((b.x - a.x) * (target.y - a.y)) / (b.y - a.y) + a.x

    return crosses ? !inside : inside
  }, false)
}

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
