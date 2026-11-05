const DELAY_MS = 400
const CHARS_PER_SECOND = 8
const TITLE_TRAVEL_REACH = 0.1

export const titleProgress = (reach: number) => 1 - (1 - Math.min(reach / TITLE_TRAVEL_REACH, 1)) ** 3

export const createMarquee = () => {
  const lingeringSince = new Map<string, number>()

  return {
    scroll(hand: string, settled: boolean, now: number) {
      if (!settled) lingeringSince.delete(hand)
      else if (!lingeringSince.has(hand)) lingeringSince.set(hand, now)

      const since = lingeringSince.get(hand)

      return since === undefined ? 0 : (Math.max(0, now - since - DELAY_MS) / 1000) * CHARS_PER_SECOND
    },

    keepOnly: (hands: Set<string>) => lingeringSince.forEach((_, hand) => hands.has(hand) || lingeringSince.delete(hand)),
  }
}
