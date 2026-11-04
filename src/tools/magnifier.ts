import { tangentCenter } from "./placement.ts"
import type { ToolDefinition } from "./tool.ts"

const LENS_RADIUS = 90
const ZOOM = 2.5

export const magnifier: ToolDefinition = {
  name: "magnifier",
  create: () => ({
    draw(frame) {
      const { surface: { ctx }, video } = frame
      const [x, y] = tangentCenter(frame, LENS_RADIUS)
      const source = (LENS_RADIUS * 2) / ZOOM
      const scale = video.videoWidth / ctx.canvas.width

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
      ctx.restore()

      ctx.beginPath()
      ctx.arc(x, y, LENS_RADIUS, 0, Math.PI * 2)
      ctx.strokeStyle = "#fff"
      ctx.lineWidth = 3
      ctx.stroke()
    },
  }),
}
