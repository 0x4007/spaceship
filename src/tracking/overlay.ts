import { HandLandmarker } from "@mediapipe/tasks-vision"

const HAND_COLORS: Record<string, string> = { Left: "#fff", Right: "#0f0" }
const TARGET_COLOR = "#ff0"
const STRIP_FONT_SIZE = 24

export function createOverlay(canvas: HTMLCanvasElement, video: HTMLVideoElement) {
  const ctx = canvas.getContext("2d")!
  const size = { width: 0, height: 0 }
  const resolution = { scale: 1 }
  const toPixels = ({ x, y }: { x: number; y: number }) => [x * size.width, y * size.height] as const

  const toScreenPixels = (point: { x: number; y: number }) => {
    const [x, y] = toPixels(point)

    return [size.width - x, y] as const
  }

  const resetCanvas = () => {
    size.width = video.videoWidth
    size.height = video.videoHeight
    resolution.scale = Math.max(1, (canvas.clientWidth * devicePixelRatio) / size.width)

    const [width, height] = [Math.round(size.width * resolution.scale), Math.round(size.height * resolution.scale)]
    if (canvas.width !== width) canvas.width = width
    if (canvas.height !== height) canvas.height = height

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, width, height)
    ctx.scale(resolution.scale, resolution.scale)
  }

  const fillCircle = (center: readonly [number, number], radius: number, color: string) => {
    ctx.beginPath()
    ctx.arc(...center, radius, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
  }

  const drawLine = (from: readonly [number, number], to: readonly [number, number]) => {
    ctx.beginPath()
    ctx.moveTo(...from)
    ctx.lineTo(...to)
    ctx.stroke()
  }

  const useTextStyle = () => {
    ctx.setTransform(-resolution.scale, 0, 0, resolution.scale, canvas.width, 0)
    ctx.font = `bold ${STRIP_FONT_SIZE}px monospace`
    ctx.textBaseline = "bottom"
    ctx.textAlign = "center"
    ctx.fillStyle = TARGET_COLOR
    ctx.strokeStyle = "#000"
    ctx.lineWidth = 4
  }

  const label = (
    text: string,
    anchor: { x: number; y: number },
    { offsetY = 0, color = TARGET_COLOR, outline = "#000" }: { offsetY?: number; color?: string; outline?: string } = {},
  ) => {
    const [x, y] = toScreenPixels(anchor)

    ctx.save()
    useTextStyle()
    ctx.fillStyle = color
    ctx.strokeStyle = outline
    ctx.strokeText(text, x, y - 4 + offsetY)
    ctx.fillText(text, x, y - 4 + offsetY)
    ctx.restore()
  }

  return {
    surface: { ctx, size, resolution, toPixels, label },

    drawHands(hands: { x: number; y: number }[][], labels: string[]) {
      resetCanvas()

      hands.forEach((points, index) => {
        const color = HAND_COLORS[labels[index]] ?? "#fff"

        ctx.strokeStyle = color
        ctx.lineWidth = 2
        HandLandmarker.HAND_CONNECTIONS.forEach(({ start, end }) => drawLine(toPixels(points[start]), toPixels(points[end])))
        points.forEach((point) => fillCircle(toPixels(point), 4, color))
      })
    },

    drawPinchTarget(center: { x: number; y: number }, radius: number) {
      const centerPixels = toPixels(center)

      ctx.strokeStyle = TARGET_COLOR
      ctx.lineWidth = 2
      fillCircle(centerPixels, radius * size.width, "rgba(255, 255, 0, 0.3)")
      ctx.stroke()
      fillCircle(centerPixels, 3, TARGET_COLOR)
    },

    drawTether(from: { x: number; y: number }, to: { x: number; y: number }) {
      ctx.strokeStyle = TARGET_COLOR
      ctx.lineWidth = 2
      drawLine(toPixels(from), toPixels(to))
    },

    drawProgressMarker(tip: { x: number; y: number }, midpoint: { x: number; y: number }, progress: number) {
      const position = { x: tip.x + (midpoint.x - tip.x) * progress, y: tip.y + (midpoint.y - tip.y) * progress }

      ctx.strokeStyle = TARGET_COLOR
      ctx.lineWidth = 2
      fillCircle(toPixels(position), 6, "#fff")
      ctx.stroke()
    },

    drawWord(word: string, position: { x: number; y: number }, direction: { x: number; y: number }, opacity: number) {
      const [x, y] = toScreenPixels(position)
      const angle = Math.atan2(direction.y * size.height, -direction.x * size.width)

      ctx.save()
      useTextStyle()
      ctx.globalAlpha = opacity
      ctx.translate(x, y)
      ctx.rotate(Math.abs(angle) > Math.PI / 2 ? angle + Math.PI : angle)
      ctx.strokeText(word, 0, -4)
      ctx.fillText(word, 0, -4)
      ctx.restore()
    },

    drawStrip(content: string, tip: { x: number; y: number }, midpoint: { x: number; y: number }) {
      const [left, right] = [toScreenPixels(tip), toScreenPixels(midpoint)].sort(([a], [b]) => a - b)
      const [tipX, tipY] = left
      const [endX, endY] = right
      const dx = endX - tipX
      const dy = endY - tipY
      const length = Math.hypot(dx, dy)

      ctx.save()
      useTextStyle()

      const charWidth = ctx.measureText("0").width
      const text = content.slice(0, Math.floor(length / charWidth))
      const angle = Math.atan2(dy, dx)
      const upright = Math.abs(angle) > Math.PI / 2 ? angle + Math.PI : angle

      ;[...text].forEach((char, index) => {
        const distance = (index + 0.5) * charWidth
        const x = tipX + (dx / length) * distance
        const y = tipY + (dy / length) * distance

        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(upright)
        ctx.strokeText(char, 0, -4)
        ctx.fillText(char, 0, -4)
        ctx.restore()
      })

      ctx.restore()
    },
  }
}
