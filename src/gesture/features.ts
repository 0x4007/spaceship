import { cosine, cross, dot, length, normalize, scale, subtract, type Point } from "./geometry.ts"
import { FINGER_CHAINS, INDEX_MCP, MIDDLE_MCP, PINKY_MCP, WRIST } from "./landmarks.ts"

const FINGERTIPS = FINGER_CHAINS.map(([, , , tip]) => tip)

export function extractFeatures(worldLandmarks: Point[], handedness: string) {
  const points = alignToPalm(worldLandmarks, handedness)

  return [...points.flatMap(({ x, y, z }) => [x, y, z]), ...fingertipDistances(points), ...fingerBends(points)]
}

function alignToPalm(worldLandmarks: Point[], handedness: string) {
  const mirror = handedness === "Left" ? -1 : 1
  const wrist = worldLandmarks[WRIST]
  const relative = worldLandmarks.map(({ x, y, z }) => ({ x: mirror * (x - wrist.x), y: y - wrist.y, z: z - wrist.z }))

  const up = normalize(relative[MIDDLE_MCP])
  const palmDirection = cross(relative[INDEX_MCP], relative[PINKY_MCP])
  const normal = normalize(subtract(palmDirection, scale(up, dot(palmDirection, up))))
  const side = cross(normal, up)
  const size = length(relative[MIDDLE_MCP])

  return relative.map((point) => ({
    x: dot(point, side) / size,
    y: dot(point, up) / size,
    z: dot(point, normal) / size,
  }))
}

const fingertipDistances = (points: Point[]) =>
  FINGERTIPS.flatMap((first, index) =>
    FINGERTIPS.slice(index + 1).map((second) => length(subtract(points[first], points[second]))),
  )

const fingerBends = (points: Point[]) =>
  FINGER_CHAINS.flatMap(([a, b, c, d]) => {
    const [base, middle, tip] = [subtract(points[b], points[a]), subtract(points[c], points[b]), subtract(points[d], points[c])]

    return [cosine(base, middle), cosine(middle, tip)]
  })
