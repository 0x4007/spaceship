export const FINGERS = ["thumb", "index", "middle", "ring", "pinky"] as const

export type Finger = (typeof FINGERS)[number]

export const fingerOfLandmark = (landmark: number): Finger | undefined => FINGERS[Math.ceil(landmark / 4) - 1]

export const fingertipOf = (finger: Finger) => (FINGERS.indexOf(finger) + 1) * 4
