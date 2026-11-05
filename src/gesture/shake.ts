import { advanceTrack, type ReversalConfig, type Track } from "./reversals.ts"

export const SHAKE_REVERSALS = 2
const COOLDOWN_MS = 1500
const CONFIG: ReversalConfig = { windowMs: 600, minSwing: 60, minSpeed: 400, wrap }

export const createShakeDetector = () => {
  const tracks = new Map<string, Track>()
  const cooldowns = new Map<string, number>()

  const detect = (hand: string, roll: number, now: number) => {
    const track = advanceTrack(tracks.get(hand), roll, now, CONFIG)
    const shaking = track.reversals.length >= SHAKE_REVERSALS

    tracks.set(hand, shaking ? { ...track, reversals: [] } : track)

    if (!shaking || now < (cooldowns.get(hand) ?? 0)) return false

    cooldowns.set(hand, now + COOLDOWN_MS)
    return true
  }

  return Object.assign(detect, { reversals: (hand: string) => tracks.get(hand)?.reversals.length ?? 0 })
}

function wrap(delta: number) {
  return ((((delta + 180) % 360) + 360) % 360) - 180
}
