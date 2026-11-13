import { tangentCenter } from "./placement.ts"
import type { ToolDefinition } from "./tool.ts"

const SAMPLE_SIZE = 5
const CROSSHAIR_RADIUS = 16
const CROSSHAIR_GAP = 5

export const colorPicker: ToolDefinition = {
  name: "color picker",
  create: () => {
    const sampler = new OffscreenCanvas(1, 1).getContext("2d", { willReadFrequently: true })!

    return {
      draw(frame) {
        const { surface, video, position } = frame
        const { ctx, size, toPixels } = surface
        const [x, y] = tangentCenter(frame, CROSSHAIR_RADIUS)
        const hex = sampleHex(sampler, video, { x: x / size.width, y: y / size.height })

        drawCrosshair(ctx, x, y)
        surface.label(hex, position, {
          offsetY: y - toPixels(position)[1] - CROSSHAIR_RADIUS - 4,
          color: hex,
        })
      },
    }
  },
}

function sampleHex(sampler: OffscreenCanvasRenderingContext2D, video: HTMLVideoElement, { x, y }: { x: number; y: number }) {
  sampler.drawImage(video, x * video.videoWidth - SAMPLE_SIZE / 2, y * video.videoHeight - SAMPLE_SIZE / 2, SAMPLE_SIZE, SAMPLE_SIZE, 0, 0, 1, 1)

  const [r, g, b] = sampler.getImageData(0, 0, 1, 1).data

  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
}

function drawCrosshair(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ;[
    ["#000", 4],
    ["#fff", 2],
  ].forEach(([color, width]) => {
    ctx.beginPath()
    ;[-1, 1].forEach((sign) => {
      ctx.moveTo(x + sign * CROSSHAIR_GAP, y)
      ctx.lineTo(x + sign * CROSSHAIR_RADIUS, y)
      ctx.moveTo(x, y + sign * CROSSHAIR_GAP)
      ctx.lineTo(x, y + sign * CROSSHAIR_RADIUS)
    })
    ctx.strokeStyle = color as string
    ctx.lineWidth = width as number
    ctx.stroke()
  })
}
