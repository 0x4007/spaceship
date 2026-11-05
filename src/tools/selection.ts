import type { Tool } from "./tool.ts"

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
