import "./style.css"
import { $, $$, showError } from "./dom.ts"
import { createPinchTracker, PINCH_TARGET_RADIUS } from "./pinch.ts"
import { startTracking, type Frame } from "./tracking/hand-tracking.ts"
import { createOverlay } from "./tracking/overlay.ts"

const cameraSelect = $<HTMLSelectElement>("#camera")
const video = $<HTMLVideoElement>("#video")
const status = $<HTMLOutputElement>("#status")
const overlay = createOverlay($<HTMLCanvasElement>("#overlay"), video)
const trackPinch = createPinchTracker()

startTracking({ video, cameraSelect, onFrame: showFrame, onError: (error) => showError(status, error) }).catch((error) =>
  showError(status, error),
)

function showFrame(frame: Frame) {
  const { pinching, targets } = trackPinch(frame, video.videoWidth / video.videoHeight)

  overlay.drawHands(frame.landmarks, frame.labels)
  targets.forEach(({ midpoint, tip }) => {
    overlay.drawPinchTarget(midpoint, PINCH_TARGET_RADIUS, tip)
    if (tip) overlay.drawStrip(tip, midpoint)
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
