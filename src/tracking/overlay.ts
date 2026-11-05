import { HandLandmarker } from "@mediapipe/tasks-vision"

const HAND_COLORS: Record<string, string> = { Left: "#fff", Right: "#0f0" }
const TARGET_COLOR = "#ff0"
const STRIP_FONT_SIZE = 13
const LABEL_FONT = `500 ${STRIP_FONT_SIZE}px Inter, system-ui, sans-serif`

const MARQUEE_GAP_CHARS = 4
const RIPPLE_RADIUS = 0.12

export type StripTitle = { length: number; progress: number; rest: { x: number; y: number } }
export type StripOptions = { title?: StripTitle; scroll?: number }

export function createOverlay(canvas: HTMLCanvasElement, video: HTMLVideoElement) {
  document.fonts.load(LABEL_FONT)
  const ctx = canvas.getContext("2d")!
  const size = { width: 0, height: 0 }
  const resolution = { scale: 1 }
  let textShown = false
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
    textShown = false
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
    ctx.font = LABEL_FONT
    ctx.textBaseline = "bottom"
    ctx.textAlign = "center"
    ctx.fillStyle = TARGET_COLOR
  }

  const label = (
    text: string,
    anchor: { x: number; y: number },
    { offsetY = 0, color = TARGET_COLOR, align = "center" }: { offsetY?: number; color?: string; align?: CanvasTextAlign } = {},
  ) => {
    const [x, y] = toScreenPixels(anchor)

    ctx.save()
    useTextStyle()
    ctx.fillStyle = color
    ctx.textAlign = align
    textShown = true
    ctx.fillText(text, x, y - 4 + offsetY)
    ctx.restore()
  }

  return {
    surface: { ctx, size, resolution, toPixels, label },

    hasText: () => textShown,

    drawRipple(center: { x: number; y: number }, progress: number) {
      ctx.strokeStyle = "#fff"
      ctx.lineWidth = 2
      ctx.globalAlpha = 1 - progress
      ctx.beginPath()
      ctx.arc(...toPixels(center), progress * RIPPLE_RADIUS * size.width, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1
    },

    drawHands(hands: { x: number; y: number }[][], labels: string[], showSkeleton: boolean) {
      resetCanvas()
      if (!showSkeleton) return

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

    drawWord(word: string, position: { x: number; y: number }, direction: { x: number; y: number }, opacity: number) {
      const [x, y] = toScreenPixels(position)
      const angle = Math.atan2(direction.y * size.height, -direction.x * size.width)

      ctx.save()
      useTextStyle()
      ctx.globalAlpha = opacity
      ctx.translate(x, y)
      ctx.rotate(Math.abs(angle) > Math.PI / 2 ? angle + Math.PI : angle)
      textShown = true
      ctx.fillText(word, 0, -4)
      ctx.restore()
    },

    drawStrip(content: string, tip: { x: number; y: number }, midpoint: { x: number; y: number }, { title, scroll = 0 }: StripOptions = {}) {
      const [left, right] = [toScreenPixels(tip), toScreenPixels(midpoint)].sort(([a], [b]) => a - b)
      const [tipX, tipY] = left
      const [endX, endY] = right
      const dx = endX - tipX
      const dy = endY - tipY
      const length = Math.hypot(dx, dy)

      ctx.save()
      useTextStyle()

      const charWidth = ctx.measureText("0").width
      const titleLength = title?.length ?? 0
      const chars = [...content]
      const widths = chars.map((char) => ctx.measureText(char).width)
      const starts = widths.map((_, index) => widths.slice(0, index).reduce((sum, width) => sum + width, 0))
      const textWidth = widths.reduce((sum, width) => sum + width, 0)
      const titleWidth = starts[Math.min(titleLength, chars.length)] ?? textWidth
      const scrolling = scroll > 0 && textWidth > length
      const cycle = textWidth + MARQUEE_GAP_CHARS * charWidth
      const [restX, restY] = title ? toScreenPixels(title.rest) : [0, 0]
      const angle = Math.atan2(dy, dx)
      const upright = Math.abs(angle) > Math.PI / 2 ? angle + Math.PI : angle
      const unit = length ? { x: dx / length, y: dy / length } : { x: 1, y: 0 }

      chars.forEach((char, index) => {
        const isTitle = index < titleLength
        const half = widths[index] / 2
        const natural = starts[index] + half
        const distance = scrolling ? wrap(natural - scroll * charWidth, cycle) : natural
        const inside = distance >= half && distance + half <= length

        if (!inside && !(isTitle && !scrolling)) return

        const opacity = scrolling ? Math.min(1, distance / (2 * charWidth), (length - distance) / (2 * charWidth)) : 1
        const online = { x: tipX + unit.x * distance, y: tipY + unit.y * distance, angle: upright }
        const rest = { x: restX + starts[index] + half - titleWidth / 2, y: restY, angle: 0 }
        const { x, y, angle: rotation } = isTitle ? blend(rest, online, title!.progress) : online

        ctx.save()
        ctx.globalAlpha = opacity
        ctx.translate(x, y)
        ctx.rotate(rotation)
        textShown = true
        ctx.fillText(char, 0, -4)
        ctx.restore()
      })

      ctx.restore()
    },
  }
}

type Pose = { x: number; y: number; angle: number }

const blend = (from: Pose, to: Pose, t: number): Pose => ({
  x: from.x + (to.x - from.x) * t,
  y: from.y + (to.y - from.y) * t,
  angle: from.angle + (to.angle - from.angle) * t,
})

const wrap = (value: number, modulus: number) => ((value % modulus) + modulus) % modulus
