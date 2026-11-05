import { createGestureClassifier } from "../gesture/inference.ts"
import { INDEX_PIP, INDEX_TIP, MIDDLE_MCP, THUMB_MCP, THUMB_TIP, WRIST } from "../gesture/landmarks.ts"
import { distanceBetween, type Point } from "../point.ts"
import type { Frame } from "../tracking/hand-tracking.ts"
import pinchFile from "./pinch.json"

export const PINCH_TARGET_RADIUS = 0.02
const PINCH_ON_THRESHOLD = 0.9
const PINCH_OFF_THRESHOLD = 0.8
const RELEASE_FRAMES = 10
const MIN_WORLD_SPAN = 0.02

const classify = createGestureClassifier(pinchFile)

export type Pinch = { confidence: number; active: boolean; framesBelowOff: number }
export type PinchTarget = {
  hand: string
  midpoint: Point
  direction: Point
  scale: number
  targetHand?: string
  landmark?: number
  tip?: Point
}
type Latch = { targetHand: string; landmark: number }

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
      const was = previous.get(label)
      const framesBelowOff = was?.active && pinch < PINCH_OFF_THRESHOLD ? was.framesBelowOff + 1 : 0
      const active = pinch >= PINCH_ON_THRESHOLD || (!!was?.active && framesBelowOff < RELEASE_FRAMES)

      return [label, { confidence: pinch, active, framesBelowOff }]
    }),
  )

function updateTargets(
  { landmarks, worldLandmarks, labels }: Frame,
  pinching: Map<string, Pinch>,
  latches: Map<string, Latch>,
  aspectRatio: number,
): PinchTarget[] {
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
        direction: pinchDirection(hand, aspectRatio),
        scale: handScale(hand, worldLandmarks[index], aspectRatio),
        targetHand: latch?.targetHand,
        landmark: latch?.landmark,
        tip: latch && otherHand?.[latch.landmark],
      },
    ]
  })
}

const pinchMidpoint = (hand: Point[]) => ({
  x: (hand[THUMB_TIP].x + hand[INDEX_TIP].x) / 2,
  y: (hand[THUMB_TIP].y + hand[INDEX_TIP].y) / 2,
})

const handScale = (hand: Point[], world: Point[], aspectRatio: number) =>
  distanceBetween(hand[MIDDLE_MCP], hand[WRIST], aspectRatio) /
  Math.max(Math.hypot(world[MIDDLE_MCP].x - world[WRIST].x, world[MIDDLE_MCP].y - world[WRIST].y), MIN_WORLD_SPAN)

const pinchDirection = (hand: Point[], aspectRatio: number) =>
  normalize(
    [fingerDirection(hand, THUMB_MCP, THUMB_TIP, aspectRatio), fingerDirection(hand, INDEX_PIP, INDEX_TIP, aspectRatio)].reduce(
      (sum, direction) => ({ x: sum.x + direction.x, y: sum.y + direction.y }),
    ),
  )

const fingerDirection = (hand: Point[], base: number, tip: number, aspectRatio: number) =>
  normalize({ x: hand[tip].x - hand[base].x, y: (hand[tip].y - hand[base].y) / aspectRatio })

const normalize = ({ x, y }: Point) => ({ x: x / (Math.hypot(x, y) || 1), y: y / (Math.hypot(x, y) || 1) })

const nearestLandmark = (target: Point, hand: Point[], aspectRatio: number) =>
  hand
    .map((point, landmark) => ({ landmark, distance: distanceBetween(point, target, aspectRatio) }))
    .reduce((nearest, candidate) => (candidate.distance < nearest.distance ? candidate : nearest))

export const announcePinches = (targets: PinchTarget[]) =>
  targets.forEach(({ hand, targetHand, landmark }) => {
    if (landmark !== undefined) document.dispatchEvent(new CustomEvent("pinch_on", { detail: { hand, targetHand, landmark } }))
  })
