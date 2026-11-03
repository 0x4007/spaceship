import { HandLandmarker } from "@mediapipe/tasks-vision"

const HAND_COLORS: Record<string, string> = { Left: "#fff", Right: "#0f0" }
const TARGET_COLOR = "#ff0"

export function createOverlay(canvas: HTMLCanvasElement, video: HTMLVideoElement) {
  const ctx = canvas.getContext("2d")!
  const toPixels = ({ x, y }: { x: number; y: number }) => [x * canvas.width, y * canvas.height] as const

  const resetCanvas = () => {
    if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth
    if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight

    ctx.clearRect(0, 0, canvas.width, canvas.height)
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

  return {
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

    drawPinchTarget(center: { x: number; y: number }, radius: number, tip?: { x: number; y: number }) {
      const centerPixels = toPixels(center)

      ctx.strokeStyle = TARGET_COLOR
      ctx.lineWidth = 2
      if (tip) drawLine(toPixels(tip), centerPixels)

      fillCircle(centerPixels, radius * canvas.width, "rgba(255, 255, 0, 0.3)")
      ctx.stroke()
      fillCircle(centerPixels, 3, TARGET_COLOR)
    },
  }
}
