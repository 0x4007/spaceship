import { cross, dot, normalize, scale, subtract, type Point } from "./geometry.ts"

const WRIST = 0
const INDEX_MCP = 5
const MIDDLE_MCP = 9
const PINKY_MCP = 17
const TOWARD_CAMERA: Point = { x: 0, y: 0, z: -1 }

export const handRoll = (worldLandmarks: Point[], label: string) => {
  const wrist = worldLandmarks[WRIST]
  const axis = normalize(subtract(worldLandmarks[MIDDLE_MCP], wrist))
  const handedness = label === "Left" ? 1 : -1
  const palmNormal = scale(
    cross(subtract(worldLandmarks[INDEX_MCP], wrist), subtract(worldLandmarks[PINKY_MCP], wrist)),
    handedness,
  )
  const reference = perpendicularTo(axis, TOWARD_CAMERA)
  const facing = perpendicularTo(axis, palmNormal)

  return (Math.atan2(dot(axis, cross(reference, facing)), dot(reference, facing)) * 180) / Math.PI
}

const perpendicularTo = (axis: Point, vector: Point) => subtract(vector, scale(axis, dot(vector, axis)))
