import { GRAVITY, OFF_SCREEN_Y } from "../chat/falling-titles.ts"
import type { Point } from "../point.ts"
import type { Bounds, LabelStyle, Surface } from "../tracking/overlay.ts"
import type { Tool } from "./tool.ts"

const LINE_CHARS = 60
const LINE_HEIGHT = 10
const HIT_PADDING = 0.01
const PLACED_STYLE: LabelStyle = { color: "#fff", align: "left" }

export type PlacedText = { text: string; position: Point }

type Falling = PlacedText & { startedAt: number }

export type PlacedTexts = ReturnType<typeof createPlacedTexts>

export const createPlacedTexts = () => {
  const placed: PlacedText[] = []
  let falling: Falling[] = []

  return {
    add: (item: PlacedText) => placed.push(item),
    count: () => placed.length,
    drop: (item: PlacedText, now: number) => falling.push({ ...item, startedAt: now }),
    clear: (now: number) => {
      const cleared = placed.splice(0)

      falling.push(...cleared.map((item) => ({ ...item, startedAt: now })))
      return cleared.length
    },
    draw: (surface: Surface, now: number) => {
      placed.forEach(({ text, position }) => drawText(surface, text, position, PLACED_STYLE))
      falling = falling.filter(({ position, startedAt }) => fallenPosition(position, startedAt, now).y < OFF_SCREEN_Y)
      falling.forEach(({ text, position, startedAt }) => drawText(surface, text, fallenPosition(position, startedAt, now), PLACED_STYLE))
    },
    itemAt: (surface: Surface, point: Point) => placed.findLast((item) => contains(boundsOf(surface, item), point)),
  }
}

export const textTool = (text: string, onRelease: (placed: PlacedText) => void, onDrop: (placed: PlacedText, now: number) => void): Tool => {
  let position: Point | undefined
  let dropped = false

  return {
    underlay: true,
    draw: (frame) => {
      if (dropped) return

      position = frame.position
      drawText(frame.surface, text, position)
    },
    drop: (now) => {
      if (dropped || !position) return

      dropped = true
      onDrop({ text, position }, now)
    },
    release: () => !dropped && position && onRelease({ text, position }),
  }
}

const fallenPosition = ({ x, y }: Point, startedAt: number, now: number) => ({ x, y: y + 0.5 * GRAVITY * ((now - startedAt) / 1000) ** 2 })

const drawText = (surface: Surface, text: string, position: Point, style: LabelStyle = PLACED_STYLE) =>
  wrap(text).forEach((line, index, lines) => surface.label(line, position, { ...style, offsetY: lineOffset(index, lines.length) }))

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

const wrap = (text: string) => text.match(new RegExp(`.{1,${LINE_CHARS}}(?:\\s|$)`, "g"))?.map((line) => line.trim()) ?? [text]
