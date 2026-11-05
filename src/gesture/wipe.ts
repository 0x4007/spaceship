import type { Point } from "../point.ts"
import { advanceTrack, type ReversalConfig, type Track } from "./reversals.ts"

const WINDOW_MS = 800
export const WIPE_REVERSALS = 2
export const WIPE_MAX_ROLL_SPREAD_DEGREES = 30
const COOLDOWN_MS = 1500
const CONFIG: ReversalConfig = { windowMs: WINDOW_MS, minSwing: 0.15, minSpeed: 1.2 }

type Roll = { degrees: number; time: number }
type Motion = { x: Track; y: Track; rolls: Roll[]; seenAt: number }

export const createWipeDetector = () => {
  const motions = new Map<string, Motion>()
  const cooldowns = new Map<string, number>()

  const detect = (hand: string, palm: Point, roll: number, aspectRatio: number, now: number) => {
    const motion = advance(motions.get(hand), palm, roll, aspectRatio, now)
    const wiping =
      Math.max(motion.x.reversals.length, motion.y.reversals.length) >= WIPE_REVERSALS && rollSpread(motion.rolls) <= WIPE_MAX_ROLL_SPREAD_DEGREES

    motions.set(hand, wiping ? { ...motion, x: { ...motion.x, reversals: [] }, y: { ...motion.y, reversals: [] } } : motion)

    if (!wiping || now < (cooldowns.get(hand) ?? 0)) return false

    cooldowns.set(hand, now + COOLDOWN_MS)
    return true
  }

  const inspect = (hand: string) => {
    const motion = motions.get(hand)

    return motion && { reversals: Math.max(motion.x.reversals.length, motion.y.reversals.length), rollSpread: rollSpread(motion.rolls) }
  }

  return Object.assign(detect, { inspect })
}

function advance(previous: Motion | undefined, palm: Point, roll: number, aspectRatio: number, now: number): Motion {
  const current = previous && now - previous.seenAt <= WINDOW_MS ? previous : undefined
  const rolls = [...(current?.rolls ?? []), { degrees: roll, time: now }].filter(({ time }) => now - time <= WINDOW_MS)

  return {
    x: advanceTrack(current?.x, palm.x, now, CONFIG),
    y: advanceTrack(current?.y, palm.y / aspectRatio, now, CONFIG),
    rolls,
    seenAt: now,
  }
}

const rollSpread = (rolls: Roll[]) => Math.max(...rolls.map(({ degrees }) => Math.abs(wrap(degrees - rolls.at(-1)!.degrees))))

const wrap = (delta: number) => ((((delta + 180) % 360) + 360) % 360) - 180
