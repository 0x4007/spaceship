import { GRAVITY, OFF_SCREEN_Y } from "../chat/falling-titles.ts"
import { INDEX_TIP } from "../gesture/landmarks.ts"
import { ACTING_HAND } from "../hands.ts"
import { lerp, type Point } from "../point.ts"
import type { PlacedText, PlacedTexts } from "../tools/text.ts"
import { handLandmarks, type Frame } from "../tracking/hand-tracking.ts"
import type { Overlay } from "../tracking/overlay.ts"
import { announce } from "../feedback.ts"
import { createDwellDetector } from "./dwell.ts"

const DWELL_RADIUS = 0.03
const DWELL_MS = 250
const LINE_COLOR = "#fff"
const RIPPLE_MS = 500
const RIPPLE_RINGS = 2
const RIPPLE_RADIUS = 0.05
const RETRACT_MS = 300
const SNAP_DRIFT = 0.08

type Link = { item: PlacedText; touch: Point }
type Retracting = { touch: Point; startedAt: number }
type Segment = { from: Point; to: Point }
type FallingSegment = Segment & { startedAt: number; drift: number }

export function createCollection(overlay: Overlay, placedTexts: PlacedTexts) {
  const links: Link[] = []
  const detectDwell = createDwellDetector(DWELL_RADIUS, DWELL_MS)
  let falling: FallingSegment[] = []
  let retracting: Retracting[] = []
  let ripples: number[] = []
  let lastTip: Point | undefined

  return {
    items: () => links.map(({ item }) => item),

    retract(now: number) {
      retracting.push(...links.map(({ touch }) => ({ touch, startedAt: now })))
      links.length = 0
    },

    snap(now: number) {
      if (lastTip) falling.push(...links.flatMap(({ touch }) => halves({ from: touch, to: lastTip! }, now)))
      links.length = 0
    },

    update(frame: Frame, aspectRatio: number, now: number) {
      const tip = handLandmarks(frame, ACTING_HAND)?.[INDEX_TIP]
      const target = tip && collectibleAt(tip)

      lastTip = tip
      if (detectDwell(tip, target, aspectRatio, now)) {
        links.push({ item: target!, touch: tip! })
        ripples.push(now)
        announce("link", target!.text)
      }

      retracting = retracting.filter(({ startedAt }) => now - startedAt < RETRACT_MS)
      ripples = ripples.filter((startedAt) => now - startedAt < RIPPLE_MS)

      if (tip) {
        links.forEach(({ touch }) => overlay.drawLine(touch, tip, LINE_COLOR))
        retracting.forEach(({ touch, startedAt }) => overlay.drawLine(lerp(touch, tip, (now - startedAt) / RETRACT_MS), tip, LINE_COLOR))
        drawRipples(tip, now)
      }

      drawFalling(now)
    },
  }

  function collectibleAt(point: Point) {
    const item = placedTexts.itemAt(overlay.surface, point)

    return item && !links.some((link) => link.item === item) ? item : undefined
  }

  function drawRipples(tip: Point, now: number) {
    ripples.forEach((startedAt) => {
      for (let ring = 0; ring < RIPPLE_RINGS; ring++) {
        const progress = (now - startedAt) / RIPPLE_MS - ring / (RIPPLE_RINGS * 2)

        if (progress > 0) overlay.drawRipple(tip, progress, RIPPLE_RADIUS)
      }
    })
  }

  function drawFalling(now: number) {
    const dropped = falling.map(({ from, to, startedAt, drift }) => {
      const seconds = (now - startedAt) / 1000
      const offset = { x: drift * seconds, y: 0.5 * GRAVITY * seconds ** 2 }

      return { from: translate(from, offset), to: translate(to, offset) }
    })

    falling = falling.filter((_, index) => Math.min(dropped[index].from.y, dropped[index].to.y) < OFF_SCREEN_Y)
    dropped.filter(({ from, to }) => Math.min(from.y, to.y) < OFF_SCREEN_Y).forEach(({ from, to }) => overlay.drawLine(from, to, LINE_COLOR))
  }
}

const translate = (point: Point, offset: Point) => ({ x: point.x + offset.x, y: point.y + offset.y })

const halves = ({ from, to }: Segment, startedAt: number): FallingSegment[] => {
  const middle = lerp(from, to, 0.5)

  return [
    { from, to: middle, startedAt, drift: -SNAP_DRIFT },
    { from: to, to: middle, startedAt, drift: SNAP_DRIFT },
  ]
}
