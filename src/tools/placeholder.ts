import type { ToolDefinition } from "./tool.ts"

export const placeholderTool = (name: string): ToolDefinition => ({
  name,
  create: () => ({ draw: ({ surface, position }) => surface.label(name, position) }),
})
