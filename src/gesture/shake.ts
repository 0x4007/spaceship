const WINDOW_MS = 600
const MIN_SWING_DEGREES = 60
const MIN_SWING_DEGREES_PER_SECOND = 400
const REVERSALS_TO_TRIGGER = 2
const COOLDOWN_MS = 1500

type Track = { last: number; unwrapped: number; extreme: number; extremeTime: number; direction: number; reversals: number[] }

export const createShakeDetector = () => {
  const tracks = new Map<string, Track>()
  const cooldowns = new Map<string, number>()

  return (hand: string, roll: number, now: number) => {
    const track = advance(tracks.get(hand), roll, now)
    const shaking = track.reversals.length >= REVERSALS_TO_TRIGGER

    tracks.set(hand, shaking ? { ...track, reversals: [] } : track)

    if (!shaking || now < (cooldowns.get(hand) ?? 0)) return false

    cooldowns.set(hand, now + COOLDOWN_MS)
    return true
  }
}

function advance(previous: Track | undefined, roll: number, now: number): Track {
  if (!previous) return { last: roll, unwrapped: roll, extreme: roll, extremeTime: now, direction: 0, reversals: [] }

  const unwrapped = previous.unwrapped + wrap(roll - previous.last)
  const track = { ...previous, last: roll, unwrapped, reversals: previous.reversals.filter((time) => now - time <= WINDOW_MS) }
  const offset = unwrapped - track.extreme
  const swung = Math.abs(offset) >= MIN_SWING_DEGREES

  const peak = { extreme: unwrapped, extremeTime: now }

  if (track.direction === 0) return swung ? { ...track, ...peak, direction: Math.sign(offset) } : track
  if (Math.sign(offset) === track.direction) return { ...track, ...peak }
  if (!swung) return track
  if (!isFastEnough(offset, now - track.extremeTime)) return { ...track, ...peak }

  return { ...track, ...peak, direction: -track.direction, reversals: [...track.reversals, now] }
}

const wrap = (delta: number) => ((((delta + 180) % 360) + 360) % 360) - 180

const isFastEnough = (degrees: number, elapsedMs: number) => (Math.abs(degrees) / Math.max(elapsedMs, 1)) * 1000 >= MIN_SWING_DEGREES_PER_SECOND
