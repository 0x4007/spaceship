import { length, subtract, type Point } from "./geometry.ts"
import { FINGER_CHAINS } from "./landmarks.ts"

type Range = readonly [curled: number, straight: number]

const FINGER_RANGES: Range[] = [
  [0.75, 0.97],
  [0.5, 0.95],
  [0.5, 0.95],
  [0.5, 0.95],
  [0.5, 0.95],
]

export const handOpenness = (worldLandmarks: Point[]) => {
  const extensions = fingerExtensions(worldLandmarks)

  return extensions.reduce((sum, extension) => sum + extension, 0) / extensions.length
}

const fingerExtensions = (worldLandmarks: Point[]) =>
  FINGER_CHAINS.map((chain, finger) => normalize(straightness(worldLandmarks, chain), FINGER_RANGES[finger]))

const straightness = (points: Point[], chain: number[]) =>
  distance(points[chain[0]], points[chain.at(-1)!]) / chain.slice(1).reduce((sum, joint, index) => sum + distance(points[chain[index]], points[joint]), 0)

const normalize = (value: number, [curled, straight]: Range) => Math.min(Math.max((value - curled) / (straight - curled), 0), 1)

const distance = (a: Point, b: Point) => length(subtract(a, b))
