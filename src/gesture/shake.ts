import { advanceTrack, type ReversalConfig, type Track } from "./reversals.ts"

const REVERSALS_TO_TRIGGER = 2
const COOLDOWN_MS = 1500
const CONFIG: ReversalConfig = { windowMs: 600, minSwing: 60, minSpeed: 400, wrap }

export const createShakeDetector = () => {
  const tracks = new Map<string, Track>()
  const cooldowns = new Map<string, number>()

  return (hand: string, roll: number, now: number) => {
    const track = advanceTrack(tracks.get(hand), roll, now, CONFIG)
    const shaking = track.reversals.length >= REVERSALS_TO_TRIGGER

    tracks.set(hand, shaking ? { ...track, reversals: [] } : track)

    if (!shaking || now < (cooldowns.get(hand) ?? 0)) return false

    cooldowns.set(hand, now + COOLDOWN_MS)
    return true
  }
}

function wrap(delta: number) {
  return ((((delta + 180) % 360) + 360) % 360) - 180
}
