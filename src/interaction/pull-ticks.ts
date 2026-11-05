import { sounds } from "../sound/sounds.ts"

const TICK_REACH = 0.02

export const createPullTicks = () => {
  const lastSteps = new Map<string, number>()

  return {
    measure(hand: string, reach: number) {
      const step = Math.floor(reach / TICK_REACH)
      const previous = lastSteps.get(hand)

      lastSteps.set(hand, step)
      if (previous !== undefined && previous !== step) sounds.tick(step)
    },

    keepOnly: (hands: Set<string>) => lastSteps.forEach((_, hand) => hands.has(hand) || lastSteps.delete(hand)),
  }
}
