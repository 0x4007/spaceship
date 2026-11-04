export const FINGERS = ["thumb", "index", "middle", "ring", "pinky"] as const

export type Finger = (typeof FINGERS)[number]

const TEXTS: Record<Finger, string> = {
  thumb: "Every great idea begins as a small thing that someone refused to ignore.",
  index: "Pointing at the problem is the first step toward understanding it.",
  middle: "Somewhere between the extremes is where the interesting work happens.",
  ring: "Commitments are easy to make and quiet to keep, which is why they matter.",
  pinky: "Small details tend to decide whether the whole thing holds together.",
}

export const fingerOfLandmark = (landmark: number): Finger | undefined => FINGERS[Math.ceil(landmark / 4) - 1]

export const contentFor = (finger: Finger) => TEXTS[finger]
