import type { LabelStyle, Point, Surface, Tool } from "./tool.ts"

const LINE_CHARS = 44
const LINE_HEIGHT = 16
const PLACED_STYLE: LabelStyle = { color: "#fff", align: "left" }

export type PlacedText = { text: string; position: Point }

export const createPlacedTexts = () => {
  const placed: PlacedText[] = []

  return {
    add: (item: PlacedText) => placed.push(item),
    draw: (surface: Surface) => placed.forEach(({ text, position }) => drawText(surface, text, position, PLACED_STYLE)),
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
    surface.label(line, position, { ...style, offsetY: (index - lines.length + 1) * LINE_HEIGHT }),
  )

const wrap = (text: string) =>
  text.match(new RegExp(`.{1,${LINE_CHARS}}(?:\\s|$)`, "g"))?.map((line) => line.trim()) ?? [text]
