const WINDOW_MS = 600;
const MIN_SWING_DEGREES = 30;
const REVERSALS_TO_TRIGGER = 2;
const COOLDOWN_MS = 1500;

type Track = { last: number; unwrapped: number; extreme: number; direction: number; reversals: number[] };

export const createShakeDetector = () => {
  const tracks = new Map<string, Track>();
  const cooldowns = new Map<string, number>();

  return (hand: string, roll: number, now: number) => {
    const track = advance(tracks.get(hand), roll, now);
    const shaking = track.reversals.length >= REVERSALS_TO_TRIGGER;

    tracks.set(hand, shaking ? { ...track, reversals: [] } : track);

    if (!shaking || now < (cooldowns.get(hand) ?? 0)) return false;

    cooldowns.set(hand, now + COOLDOWN_MS);
    return true;
  };
};

function advance(previous: Track | undefined, roll: number, now: number): Track {
  if (!previous) return { last: roll, unwrapped: roll, extreme: roll, direction: 0, reversals: [] };

  const unwrapped = previous.unwrapped + wrap(roll - previous.last);
  const track = { ...previous, last: roll, unwrapped, reversals: previous.reversals.filter((time) => now - time <= WINDOW_MS) };
  const offset = unwrapped - track.extreme;
  const swung = Math.abs(offset) >= MIN_SWING_DEGREES;

  if (track.direction === 0) return swung ? { ...track, direction: Math.sign(offset), extreme: unwrapped } : track;
  if (Math.sign(offset) === track.direction) return { ...track, extreme: unwrapped };
  if (!swung) return track;

  return { ...track, direction: -track.direction, extreme: unwrapped, reversals: [...track.reversals, now] };
}

const wrap = (delta: number) => ((((delta + 180) % 360) + 360) % 360) - 180;
