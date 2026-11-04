import type { Point, Tool } from "./tool.ts"

export const PULL_OUT_THRESHOLD = 0.3
const MARKER_START = 0.5

export const createToolSelection = () => {
  const pulled = new Map<string, Tool>()

  return {
    pulledTool: (hand: string) => pulled.get(hand),

    pullOut: (hand: string, tool: Tool) => pulled.set(hand, tool),

    keepOnly: (hands: string[]) =>
      pulled.forEach((tool, hand) => {
        if (hands.includes(hand)) return

        tool.release?.()
        pulled.delete(hand)
      }),
  }
}

export const pullProgress = (reach: number) => {
  const phase = Math.min(Math.max((reach / PULL_OUT_THRESHOLD - MARKER_START) / (1 - MARKER_START), 0), 1)

  return 1 - (1 - phase) ** 3
}

export const reachBetween = (a: Point, b: Point, aspectRatio: number) => Math.hypot(a.x - b.x, (a.y - b.y) / aspectRatio)
