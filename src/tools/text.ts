import type { Point } from "../point.ts"
import type { Bounds, LabelStyle, Surface } from "../tracking/overlay.ts"
import type { Tool } from "./tool.ts"

const LINE_CHARS = 44
const LINE_HEIGHT = 16
const HIT_PADDING = 0.01
const PLACED_STYLE: LabelStyle = { color: "#fff", align: "left" }

export type PlacedText = { text: string; position: Point }

export type PlacedTexts = ReturnType<typeof createPlacedTexts>

export const createPlacedTexts = () => {
  const placed: PlacedText[] = []

  return {
    add: (item: PlacedText) => placed.push(item),
    draw: (surface: Surface) => placed.forEach(({ text, position }) => drawText(surface, text, position, PLACED_STYLE)),
    itemAt: (surface: Surface, point: Point) => placed.findLast((item) => contains(boundsOf(surface, item), point)),
  }
}

export const textTool = (text: string, onRelease: (placed: PlacedText) => void): Tool => {
  let position: Point | undefined

  return {
    underlay: true,
    draw: (frame) => {
      position = frame.position
      drawText(frame.surface, text, position)
    },
    release: () => position && onRelease({ text, position }),
  }
}

const drawText = (surface: Surface, text: string, position: Point, style: LabelStyle = PLACED_STYLE) =>
  wrap(text).forEach((line, index, lines) =>
    surface.label(line, position, { ...style, offsetY: lineOffset(index, lines.length) }),
  )

const lineOffset = (index: number, count: number) => (index - count + 1) * LINE_HEIGHT

const boundsOf = (surface: Surface, { text, position }: PlacedText): Bounds => {
  const lines = wrap(text)
  const boxes = lines.map((line, index) => surface.labelBounds(line, position, { ...PLACED_STYLE, offsetY: lineOffset(index, lines.length) }))

  return {
    left: Math.min(...boxes.map((box) => box.left)),
    right: Math.max(...boxes.map((box) => box.right)),
    top: Math.min(...boxes.map((box) => box.top)),
    bottom: Math.max(...boxes.map((box) => box.bottom)),
  }
}

const contains = (bounds: Bounds, { x, y }: Point) =>
  x >= bounds.left - HIT_PADDING && x <= bounds.right + HIT_PADDING && y >= bounds.top - HIT_PADDING && y <= bounds.bottom + HIT_PADDING

const wrap = (text: string) =>
  text.match(new RegExp(`.{1,${LINE_CHARS}}(?:\\s|$)`, "g"))?.map((line) => line.trim()) ?? [text]
