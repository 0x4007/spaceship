import { length, subtract, type Point } from "./geometry.ts"

type Range = readonly [curled: number, straight: number]

const FINGERS: { chain: number[]; range: Range }[] = [
  { chain: [1, 2, 3, 4], range: [0.75, 0.97] },
  { chain: [5, 6, 7, 8], range: [0.5, 0.95] },
  { chain: [9, 10, 11, 12], range: [0.5, 0.95] },
  { chain: [13, 14, 15, 16], range: [0.5, 0.95] },
  { chain: [17, 18, 19, 20], range: [0.5, 0.95] },
]

export const handOpenness = (worldLandmarks: Point[]) => {
  const extensions = fingerExtensions(worldLandmarks)

  return extensions.reduce((sum, extension) => sum + extension, 0) / extensions.length
}

export const fingerExtensions = (worldLandmarks: Point[]) =>
  FINGERS.map(({ chain, range }) => normalize(straightness(worldLandmarks, chain), range))

const straightness = (points: Point[], chain: number[]) =>
  distance(points[chain[0]], points[chain.at(-1)!]) /
  chain.slice(1).reduce((sum, joint, index) => sum + distance(points[chain[index]], points[joint]), 0)

const normalize = (value: number, [curled, straight]: Range) => Math.min(Math.max((value - curled) / (straight - curled), 0), 1)

const distance = (a: Point, b: Point) => length(subtract(a, b))
