import "./style.css"
import { bindApiKeyForm } from "./api-key-form.ts"
import { createAsker } from "./chat/ask.ts"
import { createItemSlots } from "./chat/item-slots.ts"
import { KEY_STORAGE as CEREBRAS_KEY_STORAGE } from "./chat/cerebras.ts"
import { sentenceOf } from "./chat/items.ts"
import { FINGERS, fingerOfLandmark, fingertipOf, type Finger } from "./content.ts"
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
import { createPalmListener } from "./voice/palm-listener.ts"
import { API_KEY_STORAGE as ELEVENLABS_KEY_STORAGE } from "./voice/transcribe.ts"

const cameraSelect = $<HTMLSelectElement>("#camera")
const video = $<HTMLVideoElement>("#video")
const status = $<HTMLOutputElement>("#status")
const overlay = createOverlay($<HTMLCanvasElement>("#overlay"), video)
const trackPinch = createPinchTracker()
const toolSelection = createToolSelection()
const retractions = createRetractions()
const placedTexts = createPlacedTexts()
const itemSlots = createItemSlots()
const askQuestion = createAsker(itemSlots, status)
const askByVoice = createPalmListener({
  onListen: () => (status.value = "listening…"),
  onTranscript: askQuestion,
  onError: (error) => showError(status, error),
})
const transcribeByVoice = createPalmListener({
  onListen: () => (status.value = "listening…"),
  onTranscript: (text) => (status.value = `heard: ${text}`),
  onError: (error) => showError(status, error),
})
bindApiKeyForm($<HTMLFormElement>("#elevenlabs-key-form"), status, ELEVENLABS_KEY_STORAGE, "elevenlabs")
bindApiKeyForm($<HTMLFormElement>("#cerebras-key-form"), status, CEREBRAS_KEY_STORAGE, "cerebras")
const lastStrips = new Map<string, Strip>()

const ACTING_HAND = "Left"
const DISPLAY_HAND = "Right"

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
  let pulledFinger: Finger | undefined
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

    const pullsItem = hand === ACTING_HAND
    const item = pullsItem ? itemSlots.itemAt(finger) : undefined
    const definition = toolFor(finger)
    const text = pullsItem ? item && sentenceOf(item) : definition.name

    if (!text) return

    const progress = pullProgress(reachBetween(tip, midpoint, aspectRatio))

    if (progress === 1) {
      toolSelection.pullOut(hand, pullsItem ? textTool(text, placedTexts.add) : definition.create())
      if (pullsItem) itemSlots.take(finger)
      lastStrips.delete(hand)
      retractions.start({ text, origin: tip, anchor: midpoint, followHand: hand }, now)
      return
    }

    stripped.add(hand)
    if (pullsItem) pulledFinger = finger
    lastStrips.set(hand, { text, tip, midpoint })
    overlay.drawTether(tip, midpoint)
    overlay.drawStrip(text, tip, midpoint)
    overlay.drawProgressMarker(tip, midpoint, progress)
  })

  drawItemTitles(frame, pulledFinger)

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

  const inPalm = indexTipsInPalms(frame.landmarks, frame.labels, aspectRatio)

  askByVoice(!!inPalm.get(ACTING_HAND))
  transcribeByVoice(!!inPalm.get(DISPLAY_HAND))
  showDebug(frame, pinching, inPalm)

  targets.forEach(({ hand, targetHand, landmark }) => {
    if (landmark !== undefined) document.dispatchEvent(new CustomEvent("pinch_on", { detail: { hand, targetHand, landmark } }))
  })

  status.value = `hands: ${frame.landmarks.length}`
}

function drawItemTitles({ landmarks, labels }: Frame, pulledFinger: Finger | undefined) {
  const hand = landmarks[labels.indexOf(DISPLAY_HAND)]

  if (!hand) return

  FINGERS.forEach((finger) => {
    const item = itemSlots.itemAt(finger)

    if (item && finger !== pulledFinger) overlay.surface.label(item.title, hand[fingertipOf(finger)])
  })
}

function showDebug(frame: Frame, pinching: ReturnType<typeof trackPinch>["pinching"], inPalm: ReturnType<typeof indexTipsInPalms>) {
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
