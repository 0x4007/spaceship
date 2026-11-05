import type { Point } from "../point.ts"
import { tangentCenter } from "./placement.ts"
import type { ToolDefinition } from "./tool.ts"

const TIP_OFFSET = 24
const TIP_RADIUS = 6
const PEN_DOWN_RATIO = 1.12
const PEN_UP_RATIO = 1.06
const BASELINE_SMOOTHING = 0.02
const STROKE_COLOR = "#ff0"

export const pen: ToolDefinition = {
  name: "pen",
  create: () => {
    const strokes: Point[][] = []
    let baseline: number | undefined
    let down = false

    return {
      draw(frame) {
        const { ctx, size } = frame.surface
        const [x, y] = tangentCenter(frame, TIP_OFFSET)
        const tip = { x: x / size.width, y: y / size.height }

        baseline ??= frame.scale
        const wasDown = down

        down = isPenDown(frame.scale / baseline, down)
        if (!down) baseline += (frame.scale - baseline) * BASELINE_SMOOTHING
        if (down && !wasDown) strokes.push([])
        if (down) strokes.at(-1)!.push(tip)

        strokes.forEach((stroke) => drawStroke(ctx, size, stroke))
        drawTip(ctx, x, y, down)
      },
    }
  },
}

const isPenDown = (ratio: number, down: boolean) => ratio >= (down ? PEN_UP_RATIO : PEN_DOWN_RATIO)

function drawStroke(ctx: CanvasRenderingContext2D, { width, height }: { width: number; height: number }, stroke: Point[]) {
  ;[
    ["#000", 7],
    [STROKE_COLOR, 4],
  ].forEach(([color, lineWidth]) => {
    ctx.beginPath()
    stroke.forEach(({ x, y }, index) => (index ? ctx.lineTo(x * width, y * height) : ctx.moveTo(x * width, y * height)))
    if (stroke.length === 1) ctx.lineTo(stroke[0].x * width + 0.1, stroke[0].y * height)
    ctx.strokeStyle = color as string
    ctx.lineWidth = lineWidth as number
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.stroke()
  })
}

function drawTip(ctx: CanvasRenderingContext2D, x: number, y: number, down: boolean) {
  ctx.beginPath()
  ctx.arc(x, y, TIP_RADIUS, 0, Math.PI * 2)
  ctx.fillStyle = down ? STROKE_COLOR : "transparent"
  ctx.fill()
  ctx.strokeStyle = "#fff"
  ctx.lineWidth = 2
  ctx.stroke()
}
