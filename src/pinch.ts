import { createGestureClassifier } from "./gesture/inference.ts"
import type { Frame } from "./tracking/hand-tracking.ts"
import pinchFile from "./pinch.json"

export const PINCH_TARGET_RADIUS = 0.02
const PINCH_ON_THRESHOLD = 0.9
const PINCH_OFF_THRESHOLD = 0.8
const THUMB_TIP = 4
const INDEX_TIP = 8

const classify = createGestureClassifier(pinchFile)

type Pinch = { confidence: number; active: boolean }
type Latch = { targetHand: string; landmark: number }
type Point2D = { x: number; y: number }

export function createPinchTracker() {
  let pinching = new Map<string, Pinch>()
  const latches = new Map<string, Latch>()

  return (frame: Frame, aspectRatio: number) => {
    pinching = detectPinching(frame, pinching)

    return { pinching, targets: updateTargets(frame, pinching, latches, aspectRatio) }
  }
}

const detectPinching = ({ worldLandmarks, labels }: Frame, previous: Map<string, Pinch>) =>
  new Map<string, Pinch>(
    labels.map((label, index) => {
      const { pinch } = classify(worldLandmarks[index], label)
      const active = pinch >= PINCH_ON_THRESHOLD || (!!previous.get(label)?.active && pinch >= PINCH_OFF_THRESHOLD)

      return [label, { confidence: pinch, active }]
    }),
  )

function updateTargets(
  { landmarks, labels }: Frame,
  pinching: Map<string, Pinch>,
  latches: Map<string, Latch>,
  aspectRatio: number,
) {
  latches.forEach((_, label) => pinching.get(label)?.active || latches.delete(label))

  return landmarks.flatMap((hand, index) => {
    const label = labels[index]

    if (!pinching.get(label)?.active) return []

    const midpoint = pinchMidpoint(hand)
    const otherLabel = labels[1 - index]
    const otherHand = landmarks[1 - index]

    if (latches.get(label)?.targetHand !== otherLabel) latches.delete(label)

    if (otherHand && !latches.has(label)) {
      const nearest = nearestLandmark(midpoint, otherHand, aspectRatio)

      if (nearest.distance < PINCH_TARGET_RADIUS) latches.set(label, { targetHand: otherLabel, landmark: nearest.landmark })
    }

    const latch = latches.get(label)

    return [
      {
        hand: label,
        midpoint,
        targetHand: latch?.targetHand,
        landmark: latch?.landmark,
        tip: latch && otherHand?.[latch.landmark],
      },
    ]
  })
}

const pinchMidpoint = (hand: Point2D[]) => ({
  x: (hand[THUMB_TIP].x + hand[INDEX_TIP].x) / 2,
  y: (hand[THUMB_TIP].y + hand[INDEX_TIP].y) / 2,
})

const nearestLandmark = (target: Point2D, hand: Point2D[], aspectRatio: number) =>
  hand
    .map((point, landmark) => ({ landmark, distance: Math.hypot(point.x - target.x, (point.y - target.y) / aspectRatio) }))
    .reduce((nearest, candidate) => (candidate.distance < nearest.distance ? candidate : nearest))
