import { extractFeatures } from "./features.ts"
import type { Point } from "./geometry.ts"

type LogisticModel = { weights: number[]; bias: number; mean: number[]; std: number[] }
type ModelFileGestures = { gestures: (LogisticModel & { name: string })[] }

export function createGestureClassifier({ gestures }: ModelFileGestures) {
  return (worldLandmarks: Point[], handedness: string) => {
    const features = extractFeatures(worldLandmarks, handedness)

    return Object.fromEntries(gestures.map((gesture) => [gesture.name, confidence(gesture, features)]))
  }
}

export const confidence = ({ weights, bias, mean, std }: LogisticModel, features: number[]) =>
  sigmoid(weights.reduce((logit, weight, index) => logit + (weight * (features[index] - mean[index])) / std[index], bias))

export const sigmoid = (value: number) => 1 / (1 + Math.exp(-value))
