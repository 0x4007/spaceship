import type { Point } from "../point.ts"

export type Caret = { line: number; x: number }

export type TextMetrics = { padding: number; lineHeight: number }

export function caretAt({ x, y }: Point, { padding, lineHeight }: TextMetrics): Caret {
  return { line: Math.floor((y - padding) / lineHeight), x: x - padding }
}

export function isAhead(next: Caret, previous: Caret) {
  return next.line > previous.line || (next.line === previous.line && next.x > previous.x)
}
