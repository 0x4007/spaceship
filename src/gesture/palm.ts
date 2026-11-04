import type { Point } from "./geometry.ts"

const PALM_OUTLINE = [0, 1, 5, 9, 13, 17]
const INDEX_TIP = 8

export const indexTipsInPalms = (landmarks: Point[][], labels: string[], aspectRatio: number) =>
  new Map(
    labels.map((label, index) => {
      const tip = landmarks[index][INDEX_TIP]
      const other = landmarks[1 - index]

      return [label, !!other && insidePolygon(tip, PALM_OUTLINE.map((landmark) => other[landmark]), aspectRatio)]
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
