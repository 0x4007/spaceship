export const PULL_OUT_SPEED = 0.6
const SPEED_SMOOTHING = 0.5

export const createPullSpeeds = () => {
  const last = new Map<string, { reach: number; at: number; speed: number }>()

  return {
    measure(hand: string, reach: number, now: number) {
      const previous = last.get(hand)
      const instant = previous ? ((reach - previous.reach) / Math.max(now - previous.at, 1)) * 1000 : 0
      const speed = previous ? previous.speed + (instant - previous.speed) * SPEED_SMOOTHING : 0

      last.set(hand, { reach, at: now, speed })

      return speed
    },

    keepOnly: (hands: Set<string>) => last.forEach((_, hand) => hands.has(hand) || last.delete(hand)),
  }
}
