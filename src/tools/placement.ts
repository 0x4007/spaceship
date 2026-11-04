import type { ToolFrame } from "./tool.ts"

export const tangentCenter = ({ surface, position, direction }: ToolFrame, radius: number) => {
  const [x, y] = surface.toPixels(position)

  return [x + direction.x * radius, y + direction.y * radius] as const
}
