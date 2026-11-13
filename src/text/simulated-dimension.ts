import { delay } from "./completion.ts"
import type { Dimension, DimensionSource } from "./dimension.ts"

const LATENCY_MS = 150

const DIMENSIONS: Dimension[] = [
  { name: "tension", kind: "scale", low: "calm", high: "tense" },
  { name: "turn", kind: "choice", options: ["resolve", "suspend", "twist"] },
  { name: "pace", kind: "scale", low: "lingering", high: "brisk" },
  { name: "voice", kind: "choice", options: ["action", "dialogue", "thought"] },
  { name: "mood", kind: "scale", low: "dark", high: "light" },
  { name: "distance", kind: "scale", low: "intimate", high: "detached" },
]

export const simulatedDimension: DimensionSource = async ({ taken }, signal) => {
  await delay(LATENCY_MS, signal)
  const takenNames = new Set(taken.map(({ name }) => name))
  return DIMENSIONS.find(({ name }) => !takenNames.has(name)) ?? DIMENSIONS[Math.floor(Math.random() * DIMENSIONS.length)]
}
