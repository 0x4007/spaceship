import type { Point, Tool, ToolDefinition } from "./tool.ts"

export const PULL_OUT_THRESHOLD = 0.06

export const createToolSelection = () => {
  const pulled = new Map<string, Tool>()

  return {
    pulledTool: (hand: string) => pulled.get(hand),

    pullOut: (hand: string, { create }: ToolDefinition) => pulled.set(hand, create()),

    keepOnly: (hands: string[]) => pulled.forEach((_, hand) => hands.includes(hand) || pulled.delete(hand)),
  }
}

export const isPulledOut = (reach: number, { name }: ToolDefinition, charWidth: number) =>
  reach > name.length * charWidth + PULL_OUT_THRESHOLD

export const reachBetween = (a: Point, b: Point, aspectRatio: number) => Math.hypot(a.x - b.x, (a.y - b.y) / aspectRatio)
