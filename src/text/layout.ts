import { layoutNextLine, type PreparedTextWithSegments } from "@chenglou/pretext"
import type { Caret } from "./caret.ts"

export function layoutLines(layout: PreparedTextWithSegments, caret: Caret, fullWidth: number) {
  const lines: string[] = []
  let cursor
  for (let i = 0; i <= caret.line; i++) {
    const width = i === caret.line ? caret.x : fullWidth
    const line = layoutNextLine(layout, width, cursor)
    if (!line || line.width > width) break
    lines.push(line.text)
    cursor = line.end
  }
  return lines
}
