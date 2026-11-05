import { tangentCenter } from "./placement.ts"
import type { ToolDefinition } from "./tool.ts"

const LENS_RADIUS = 90
const ZOOM = 2.5

const overlaySnapshot = document.createElement("canvas").getContext("2d")!

export const magnifier: ToolDefinition = {
  name: "magnifier",
  create: () => ({
    draw(frame) {
      const { surface: { ctx, size, resolution }, video } = frame
      const [x, y] = tangentCenter(frame, LENS_RADIUS)
      const source = (LENS_RADIUS * 2) / ZOOM
      const scale = video.videoWidth / size.width
      const pixelScale = resolution.scale

      const diameter = LENS_RADIUS * 2
      const snapshotSize = Math.round(diameter * pixelScale)
      overlaySnapshot.canvas.width = snapshotSize
      overlaySnapshot.canvas.height = snapshotSize
      overlaySnapshot.drawImage(
        ctx.canvas,
        (x - source / 2) * pixelScale,
        (y - source / 2) * pixelScale,
        source * pixelScale,
        source * pixelScale,
        0,
        0,
        snapshotSize,
        snapshotSize,
      )

      ctx.save()
      ctx.beginPath()
      ctx.arc(x, y, LENS_RADIUS, 0, Math.PI * 2)
      ctx.clip()
      ctx.drawImage(
        video,
        (x - source / 2) * scale,
        (y - source / 2) * scale,
        source * scale,
        source * scale,
        x - LENS_RADIUS,
        y - LENS_RADIUS,
        LENS_RADIUS * 2,
        LENS_RADIUS * 2,
      )
      ctx.drawImage(overlaySnapshot.canvas, x - LENS_RADIUS, y - LENS_RADIUS, diameter, diameter)
      ctx.restore()

      ctx.beginPath()
      ctx.arc(x, y, LENS_RADIUS, 0, Math.PI * 2)
      ctx.strokeStyle = "#fff"
      ctx.lineWidth = 3
      ctx.stroke()
    },
  }),
}
