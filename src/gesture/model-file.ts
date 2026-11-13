import type { TrainedGesture } from "./training.ts"

const FEATURE_DESCRIPTION =
  "Per hand: MediaPipe world landmarks 0..20, left hands mirrored (x negated), translated to the wrist and rotated into a palm frame (y = wrist to middle MCP, z = palm normal from index MCP and pinky MCP), divided by wrist-to-middle-MCP distance, flattened as [x, y, z] x 21 (63 numbers); then 10 pairwise fingertip distances (thumb, index, middle, ring, pinky; pairs in order 01 02 03 04 12 13 14 23 24 34) in the same units; then 10 finger bend cosines (for each finger chain, cosine between consecutive bone vectors at its two inner joints, fingers in order thumb to pinky). 83 numbers total, invariant to hand rotation and distance."

const INFERENCE_DESCRIPTION = "z_i = (x_i - mean_i) / std_i; confidence = 1 / (1 + exp(-(bias + sum_i weights_i * z_i)))"

export const createModelFile = (gestures: TrainedGesture[]) => ({
  version: 2,
  feature: FEATURE_DESCRIPTION,
  inference: INFERENCE_DESCRIPTION,
  gestures,
})
