import "./style.css"
import { contentFor, fingerOfLandmark } from "./content.ts"
import { $, $$, showError } from "./dom.ts"
import { createPinchTracker, PINCH_TARGET_RADIUS } from "./pinch.ts"
import { createRetractions } from "./retraction.ts"
import { toolFor } from "./tools/index.ts"
import { createToolSelection, isPulledOut, reachBetween } from "./tools/selection.ts"
import { startTracking, type Frame } from "./tracking/hand-tracking.ts"
import { createOverlay } from "./tracking/overlay.ts"

const cameraSelect = $<HTMLSelectElement>("#camera")
const video = $<HTMLVideoElement>("#video")
const status = $<HTMLOutputElement>("#status")
const overlay = createOverlay($<HTMLCanvasElement>("#overlay"), video)
const trackPinch = createPinchTracker()
const toolSelection = createToolSelection()
const retractions = createRetractions()
const lastStrips = new Map<string, Strip>()

type Point = { x: number; y: number }
type Strip = { text: string; tip: Point; midpoint: Point }

startTracking({ video, cameraSelect, onFrame: showFrame, onError: (error) => showError(status, error) }).catch((error) =>
  showError(status, error),
)

function showFrame(frame: Frame) {
  const { pinching, targets } = trackPinch(frame, video.videoWidth / video.videoHeight)

  overlay.drawHands(frame.landmarks, frame.labels)
  const now = performance.now()
  const aspectRatio = video.videoWidth / video.videoHeight
  const midpoints = new Map(targets.map(({ hand, midpoint }) => [hand, midpoint]))
  const stripped = new Set<string>()

  toolSelection.keepOnly(targets.map(({ hand }) => hand))

  targets.forEach(({ hand, midpoint, direction, tip, landmark }) => {
    overlay.drawPinchTarget(midpoint, PINCH_TARGET_RADIUS)

    const finger = landmark === undefined ? undefined : fingerOfLandmark(landmark)
    const pulledTool = toolSelection.pulledTool(hand)

    if (pulledTool) return pulledTool.draw({ position: midpoint, direction, video, surface: overlay.surface })
    if (!tip || !finger) return

    const definition = toolFor(finger)
    const text = hand === "Left" ? contentFor(finger) : definition.name
    const pulledOut =
      hand === "Right" && isPulledOut(reachBetween(tip, midpoint, aspectRatio), definition, overlay.stripCharWidth())

    if (pulledOut) {
      toolSelection.pullOut(hand, definition)
      lastStrips.delete(hand)
      retractions.start({ text, origin: tip, anchor: midpoint, followHand: hand }, now)
      return
    }

    stripped.add(hand)
    lastStrips.set(hand, { text, tip, midpoint })
    overlay.drawTether(tip, midpoint)
    overlay.drawStrip(text, tip, midpoint)
  })

  lastStrips.forEach(({ text, tip, midpoint }, hand) => {
    if (stripped.has(hand)) return

    retractions.start({ text, origin: midpoint, anchor: tip }, now)
    lastStrips.delete(hand)
  })

  retractions.segments(now, midpoints).forEach(({ text, anchor, end }) => {
    overlay.drawTether(end, anchor)
    overlay.drawStrip(text, end, anchor)
  })

  $$<HTMLTableCellElement>("tr[data-hand] td").forEach((cell) => {
    const pinch = pinching.get(cell.parentElement!.dataset.hand!)

    cell.textContent = pinch ? `${pinch.active ? "yes" : "no"} (${pinch.confidence.toFixed(2)})` : "—"
  })

  targets.forEach(({ hand, targetHand, landmark }) => {
    if (landmark !== undefined) document.dispatchEvent(new CustomEvent("pinch_on", { detail: { hand, targetHand, landmark } }))
  })

  status.value = `hands: ${frame.landmarks.length}`
}
