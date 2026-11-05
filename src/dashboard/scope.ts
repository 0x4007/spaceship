const SAMPLES = 120
const PADDING = 2
const GRID_ALPHA = 0.2
const THRESHOLD_ALPHA = 0.7
const FILL_ALPHA = 0.12
const MARKER_SIZE = 4
const THRESHOLD_DASH = [2, 3]
const LABEL_FONT = "10px monospace"

type Sample = number | undefined
type Scale = { min: number; max: number; thresholds?: number[] }
type Segment = { x: number; y: number }[]

export function createScope(canvas: HTMLCanvasElement, scale: Scale) {
  const context = canvas.getContext("2d")!
  const samples: Sample[] = []
  let color = "#fff"

  return {
    push(sample: Sample) {
      samples.push(sample)
      if (samples.length > SAMPLES) samples.shift()
      draw()
    },
  }

  function draw() {
    const { width, height } = fit()
    const yOf = (value: number) => PADDING + (1 - (clamp(value, scale) - scale.min) / (scale.max - scale.min)) * (height - PADDING * 2)
    const segments = segmentsOf(samples, width, yOf)

    context.clearRect(0, 0, width, height)
    context.strokeStyle = color
    context.fillStyle = color
    context.lineWidth = 1

    if (scale.min < 0 && scale.max > 0) drawGuide(yOf(0), width, GRID_ALPHA, [])
    scale.thresholds?.forEach((threshold) => drawThreshold(threshold, yOf(threshold), width))
    segments.forEach((segment) => drawSegment(segment, height))
    drawMarker(segments.at(-1)?.at(-1), width)
  }

  function fit() {
    const ratio = window.devicePixelRatio || 1
    const width = Math.round(canvas.clientWidth * ratio)
    const height = Math.round(canvas.clientHeight * ratio)

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
      color = getComputedStyle(canvas).color
      context.font = LABEL_FONT
    }

    return { width, height }
  }

  function drawGuide(y: number, width: number, alpha: number, dash: number[]) {
    context.globalAlpha = alpha
    context.setLineDash(dash)
    context.beginPath()
    context.moveTo(0, y)
    context.lineTo(width, y)
    context.stroke()
    context.setLineDash([])
    context.globalAlpha = 1
  }

  function drawThreshold(value: number, y: number, width: number) {
    drawGuide(y, width, THRESHOLD_ALPHA, THRESHOLD_DASH)
    context.globalAlpha = THRESHOLD_ALPHA
    context.fillText(String(value), 3, y - 3)
    context.globalAlpha = 1
  }

  function drawSegment(segment: Segment, height: number) {
    context.beginPath()
    segment.forEach(({ x, y }, index) => (index ? context.lineTo(x, y) : context.moveTo(x, y)))
    context.stroke()

    context.globalAlpha = FILL_ALPHA
    context.lineTo(segment.at(-1)!.x, height)
    context.lineTo(segment[0].x, height)
    context.fill()
    context.globalAlpha = 1
  }

  function drawMarker(point: { x: number; y: number } | undefined, width: number) {
    if (point && point.x >= width - 1) context.fillRect(point.x - MARKER_SIZE, point.y - MARKER_SIZE / 2, MARKER_SIZE, MARKER_SIZE)
  }
}

const clamp = (value: number, { min, max }: Scale) => Math.min(Math.max(value, min), max)

function segmentsOf(samples: Sample[], width: number, yOf: (value: number) => number) {
  const offset = SAMPLES - samples.length
  const segments: Segment[] = []
  let open = false

  samples.forEach((sample, index) => {
    if (sample === undefined) {
      open = false
      return
    }

    if (!open) segments.push([])
    open = true
    segments.at(-1)!.push({ x: ((index + offset) / (SAMPLES - 1)) * (width - 1), y: yOf(sample) })
  })

  return segments
}
