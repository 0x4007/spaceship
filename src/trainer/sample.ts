import { extractFeatures } from "../gesture/features.ts"
import type { Point } from "../gesture/geometry.ts"

const COORDINATE_PRECISION = 1e5

export type Sample = ReturnType<typeof toSample>

export const toSample = (worldLandmarks: Point[], hand: string) => ({
  hand,
  landmarks: worldLandmarks
    .flatMap(({ x, y, z }) => [x, y, z])
    .map((value) => Math.round(value * COORDINATE_PRECISION) / COORDINATE_PRECISION),
})

export const toFeatures = ({ hand, landmarks }: Sample) =>
  extractFeatures(
    Array.from({ length: landmarks.length / 3 }, (_, index) => ({
      x: landmarks[index * 3],
      y: landmarks[index * 3 + 1],
      z: landmarks[index * 3 + 2],
    })),
    hand,
  )
