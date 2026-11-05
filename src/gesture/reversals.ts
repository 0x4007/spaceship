export type ReversalConfig = { windowMs: number; minSwing: number; minSpeed: number; wrap?: (delta: number) => number }

export type Track = { last: number; unwrapped: number; extreme: number; extremeTime: number; direction: number; reversals: number[] }

export function advanceTrack(previous: Track | undefined, value: number, now: number, config: ReversalConfig): Track {
  if (!previous) return { last: value, unwrapped: value, extreme: value, extremeTime: now, direction: 0, reversals: [] }

  const unwrapped = previous.unwrapped + (config.wrap ?? identity)(value - previous.last)
  const track = { ...previous, last: value, unwrapped, reversals: previous.reversals.filter((time) => now - time <= config.windowMs) }
  const offset = unwrapped - track.extreme
  const swung = Math.abs(offset) >= config.minSwing

  const peak = { extreme: unwrapped, extremeTime: now }

  if (track.direction === 0) return swung ? { ...track, ...peak, direction: Math.sign(offset) } : track
  if (Math.sign(offset) === track.direction) return { ...track, ...peak }
  if (!swung) return track
  if (!isFastEnough(offset, now - track.extremeTime, config.minSpeed)) return { ...track, ...peak }

  return { ...track, ...peak, direction: -track.direction, reversals: [...track.reversals, now] }
}

const identity = (delta: number) => delta

const isFastEnough = (distance: number, elapsedMs: number, minSpeed: number) => (Math.abs(distance) / Math.max(elapsedMs, 1)) * 1000 >= minSpeed
