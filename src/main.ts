import "./style.css"
import { contentFor, fingerOfLandmark } from "./content.ts"
import { $, $$, showError } from "./dom.ts"
import { handOpenness } from "./gesture/openness.ts"
import { indexTipsInPalms } from "./gesture/palm.ts"
import { createPinchTracker, PINCH_TARGET_RADIUS } from "./pinch.ts"
import { createRetractions } from "./retraction.ts"
import { toolFor } from "./tools/index.ts"
import { createToolSelection, pullProgress, reachBetween } from "./tools/selection.ts"
import { createPlacedTexts, textTool } from "./tools/text.ts"
import { startTracking, type Frame } from "./tracking/hand-tracking.ts"
import { createOverlay } from "./tracking/overlay.ts"
import { bindApiKeyForm } from "./voice/api-key-form.ts"
import { createPalmListener } from "./voice/palm-listener.ts"

const cameraSelect = $<HTMLSelectElement>("#camera")
const video = $<HTMLVideoElement>("#video")
const status = $<HTMLOutputElement>("#status")
const overlay = createOverlay($<HTMLCanvasElement>("#overlay"), video)
const trackPinch = createPinchTracker()
const toolSelection = createToolSelection()
const retractions = createRetractions()
const placedTexts = createPlacedTexts()
const listenOnPalm = createPalmListener()
bindApiKeyForm($<HTMLFormElement>("#api-key-form"), status)
const lastStrips = new Map<string, Strip>()

type Point = { x: number; y: number }
type Strip = { text: string; tip: Point; midpoint: Point }

startTracking({ video, cameraSelect, onFrame: showFrame, onError: (error) => showError(status, error) }).catch((error) =>
  showError(status, error),
)

function showFrame(frame: Frame) {
  const { pinching, targets } = trackPinch(frame, video.videoWidth / video.videoHeight)

  overlay.drawHands(frame.landmarks, frame.labels)
  placedTexts.draw(overlay.surface)
  const now = performance.now()
  const aspectRatio = video.videoWidth / video.videoHeight
  const midpoints = new Map(targets.map(({ hand, midpoint }) => [hand, midpoint]))
  const stripped = new Set<string>()
  const toolDraws: { underlay: boolean; draw: () => void }[] = []

  toolSelection.keepOnly(targets.map(({ hand }) => hand))

  targets.forEach(({ hand, midpoint, direction, scale, tip, landmark }) => {
    overlay.drawPinchTarget(midpoint, PINCH_TARGET_RADIUS)

    const finger = landmark === undefined ? undefined : fingerOfLandmark(landmark)
    const pulledTool = toolSelection.pulledTool(hand)

    if (pulledTool) {
      toolDraws.push({
        underlay: !!pulledTool.underlay,
        draw: () => pulledTool.draw({ position: midpoint, direction, scale, video, surface: overlay.surface }),
      })
      return
    }
    if (!tip || !finger) return

    const definition = toolFor(finger)
    const text = hand === "Left" ? contentFor(finger) : definition.name
    const progress = pullProgress(reachBetween(tip, midpoint, aspectRatio))

    if (progress === 1) {
      toolSelection.pullOut(hand, hand === "Left" ? textTool(text, placedTexts.add) : definition.create())
      lastStrips.delete(hand)
      retractions.start({ text, origin: tip, anchor: midpoint, followHand: hand }, now)
      return
    }

    stripped.add(hand)
    lastStrips.set(hand, { text, tip, midpoint })
    overlay.drawTether(tip, midpoint)
    overlay.drawStrip(text, tip, midpoint)
    overlay.drawProgressMarker(tip, midpoint, progress)
  })

  toolDraws.sort((a, b) => Number(b.underlay) - Number(a.underlay)).forEach(({ draw }) => draw())

  lastStrips.forEach(({ text, tip, midpoint }, hand) => {
    if (stripped.has(hand)) return

    retractions.start({ text, origin: midpoint, anchor: tip }, now)
    lastStrips.delete(hand)
  })

  retractions.segments(now, midpoints).forEach(({ text, anchor, end }) => {
    overlay.drawTether(end, anchor)
    overlay.drawStrip(text, end, anchor)
  })

  showDebug(frame, pinching, aspectRatio)

  targets.forEach(({ hand, targetHand, landmark }) => {
    if (landmark !== undefined) document.dispatchEvent(new CustomEvent("pinch_on", { detail: { hand, targetHand, landmark } }))
  })

  status.value = `hands: ${frame.landmarks.length}`
}

function showDebug(frame: Frame, pinching: ReturnType<typeof trackPinch>["pinching"], aspectRatio: number) {
  const inPalm = indexTipsInPalms(frame.landmarks, frame.labels, aspectRatio)
  listenOnPalm([...inPalm.values()].some(Boolean))
  const openness = new Map(frame.labels.map((label, index) => [label, handOpenness(frame.worldLandmarks[index])]))

  $$<HTMLTableRowElement>("tr[data-hand]").forEach((row) => {
    const hand = row.dataset.hand!
    const pinch = pinching.get(hand)
    const fields = {
      pinching: pinch ? `${pinch.active ? "yes" : "no"} (${pinch.confidence.toFixed(2)})` : "—",
      openness: openness.has(hand) ? openness.get(hand)!.toFixed(2) : "—",
      palm: inPalm.has(hand) ? (inPalm.get(hand) ? "yes" : "no") : "—",
    }

    Object.entries(fields).forEach(([field, text]) => (row.querySelector(`[data-field=${field}]`)!.textContent = text))
  })
}
