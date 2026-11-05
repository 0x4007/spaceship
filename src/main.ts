import "@fontsource/inter/500.css"
import "./style.css"
import { bindApiKeyForm } from "./api-key-form.ts"
import { createAsker } from "./chat/ask.ts"
import { createFallingTitles } from "./chat/falling-titles.ts"
import { createItemSlots } from "./chat/item-slots.ts"
import { KEY_STORAGE as CEREBRAS_KEY_STORAGE } from "./chat/cerebras.ts"
import { pulledTextOf } from "./chat/items.ts"
import { FINGERS, fingerOfLandmark, fingertipOf, type Finger } from "./content.ts"
import { $, $$, showError } from "./dom.ts"
import { handOpenness } from "./gesture/openness.ts"
import { handRoll } from "./gesture/rotation.ts"
import { createShakeDetector } from "./gesture/shake.ts"
import { INDEX_MCP, INDEX_TIP, indexTipsInPalms, palmCenter } from "./gesture/palm.ts"
import { createPinchTracker, PINCH_TARGET_RADIUS } from "./pinch.ts"
import { createRetractions } from "./retraction.ts"
import { toolFor } from "./tools/index.ts"
import { createPullSpeeds, createToolSelection, PULL_OUT_SPEED, reachBetween, titleProgress } from "./tools/selection.ts"
import { createPlacedTexts, textTool } from "./tools/text.ts"
import { startTracking, type Frame } from "./tracking/hand-tracking.ts"
import { createOverlay } from "./tracking/overlay.ts"
import { createPalmListener } from "./voice/palm-listener.ts"
import { createTranscriptFlow } from "./voice/transcript-flow.ts"
import { API_KEY_STORAGE as ELEVENLABS_KEY_STORAGE } from "./voice/transcribe.ts"

const cameraSelect = $<HTMLSelectElement>("#camera")
const skeletonCheckbox = $<HTMLInputElement>("#skeleton")
const video = $<HTMLVideoElement>("#video")
const status = $<HTMLOutputElement>("#status")
const overlay = createOverlay($<HTMLCanvasElement>("#overlay"), video)
const trackPinch = createPinchTracker()
const detectShake = createShakeDetector()
const toolSelection = createToolSelection()
const retractions = createRetractions()
const placedTexts = createPlacedTexts()
const itemSlots = createItemSlots()
const fallingTitles = createFallingTitles()
const askQuestion = createAsker(itemSlots, status)
const listeningHands = new Set<string>()
const askFlow = createTranscriptFlow()
const transcribeFlow = createTranscriptFlow()
const askByVoice = createPalmListener({
  onListen: () => listening(askFlow, ACTING_HAND),
  onPartial: askFlow.push,
  onTranscript: (text) => {
    askFlow.push(text, true)
    listeningHands.delete(ACTING_HAND)
    askQuestion(text)
  },
  onError: (error) => (listeningHands.delete(ACTING_HAND), showError(status, error)),
})
const transcribeByVoice = createPalmListener({
  onListen: () => listening(transcribeFlow, DISPLAY_HAND),
  onPartial: transcribeFlow.push,
  onTranscript: (text) => {
    transcribeFlow.push(text, true)
    listeningHands.delete(DISPLAY_HAND)
    status.value = `heard: ${text}`
  },
  onError: (error) => (listeningHands.delete(DISPLAY_HAND), showError(status, error)),
})
bindApiKeyForm($<HTMLFormElement>("#elevenlabs-key-form"), status, ELEVENLABS_KEY_STORAGE, "elevenlabs")
bindApiKeyForm($<HTMLFormElement>("#cerebras-key-form"), status, CEREBRAS_KEY_STORAGE, "cerebras")
const pullSpeeds = createPullSpeeds()
const lastStrips = new Map<string, Strip>()
const lingeringSince = new Map<string, number>()

const ACTING_HAND = "Left"
const DISPLAY_HAND = "Right"
const MARQUEE_DELAY_MS = 400
const RIPPLE_RINGS = 3
const RIPPLE_PERIOD_MS = 1200
const MARQUEE_CHARS_PER_SECOND = 8

type Point = { x: number; y: number }
type Strip = { text: string; tip: Point; midpoint: Point; title?: { length: number; progress: number }; finger?: Finger }

startTracking({ video, cameraSelect, onFrame: showFrame, onError: (error) => showError(status, error) }).catch((error) =>
  showError(status, error),
)

function showFrame(frame: Frame) {
  const { pinching, targets } = trackPinch(frame, video.videoWidth / video.videoHeight)

  overlay.drawHands(frame.landmarks, frame.labels, skeletonCheckbox.checked)
  placedTexts.draw(overlay.surface)
  const now = performance.now()
  drawTranscriptFlow(askFlow, frame, ACTING_HAND, DISPLAY_HAND, now)
  drawTranscriptFlow(transcribeFlow, frame, DISPLAY_HAND, ACTING_HAND, now)
  const aspectRatio = video.videoWidth / video.videoHeight
  const midpoints = new Map(targets.map(({ hand, midpoint }) => [hand, midpoint]))
  const stripped = new Set<string>()
  const hiddenTitles = new Set<Finger>()
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
    const text = pullsItem ? item && pulledTextOf(item) : definition.name

    if (!text) return

    const reach = reachBetween(tip, midpoint, aspectRatio)

    if (pullSpeeds.measure(hand, reach, now) >= PULL_OUT_SPEED) {
      toolSelection.pullOut(hand, pullsItem ? textTool(text, placedTexts.add) : definition.create())
      if (pullsItem) itemSlots.take(finger)
      lastStrips.delete(hand)
      retractions.start({ text, origin: tip, anchor: midpoint, followHand: hand }, now)
      return
    }

    const title = item && { length: item.title.length, progress: titleProgress(reach) }

    if (title && title.progress < 1) lingeringSince.delete(hand)
    else if (!lingeringSince.has(hand)) lingeringSince.set(hand, now)

    stripped.add(hand)
    if (pullsItem) hiddenTitles.add(finger)
    lastStrips.set(hand, { text, tip, midpoint, title, finger: pullsItem ? finger : undefined })
    overlay.drawTether(tip, midpoint)
    overlay.drawStrip(text, tip, midpoint, {
      title: title && { ...title, rest: tip },
      scroll: pullsItem ? marqueeScroll(lingeringSince.get(hand), now) : 0,
    })
  })

  lingeringSince.forEach((_, hand) => stripped.has(hand) || lingeringSince.delete(hand))
  pullSpeeds.keepOnly(stripped)

  toolDraws.sort((a, b) => Number(b.underlay) - Number(a.underlay)).forEach(({ draw }) => draw())

  lastStrips.forEach(({ text, tip, midpoint, title, finger }, hand) => {
    if (stripped.has(hand)) return

    retractions.start({ text, origin: midpoint, anchor: tip, title, finger }, now)
    lastStrips.delete(hand)
  })

  retractions.segments(now, midpoints).forEach(({ text, anchor, end, title, finger }) => {
    if (finger) hiddenTitles.add(finger)
    overlay.drawTether(end, anchor)
    overlay.drawStrip(text, end, anchor, { title: title && { ...title, rest: anchor } })
  })

  const rolls = new Map(frame.labels.map((label, index) => [label, handRoll(frame.worldLandmarks[index], label)]))

  if (rolls.has(DISPLAY_HAND) && detectShake(DISPLAY_HAND, rolls.get(DISPLAY_HAND)!, now)) shakeOffTitles(frame, now)

  drawItemTitles(frame, hiddenTitles)
  fallingTitles.positions(now).forEach(({ title, point }) => overlay.surface.label(title, point))

  const inPalm = indexTipsInPalms(frame.landmarks, frame.labels, aspectRatio)

  askByVoice(!!inPalm.get(ACTING_HAND))
  transcribeByVoice(!!inPalm.get(DISPLAY_HAND))
  ;[ACTING_HAND, DISPLAY_HAND].forEach((hand) => inPalm.get(hand) && listeningHands.has(hand) && drawListeningRipples(frame, hand, now))
  video.classList.toggle("dimmed", overlay.hasText())
  showDebug(frame, pinching, inPalm, rolls)

  targets.forEach(({ hand, targetHand, landmark }) => {
    if (landmark !== undefined) document.dispatchEvent(new CustomEvent("pinch_on", { detail: { hand, targetHand, landmark } }))
  })

  status.value = `hands: ${frame.landmarks.length}`
}

function listening(flow: ReturnType<typeof createTranscriptFlow>, hand: string) {
  flow.reset()
  listeningHands.add(hand)
  status.value = "listening…"
}

function drawTranscriptFlow(
  flow: ReturnType<typeof createTranscriptFlow>,
  { landmarks, labels }: Frame,
  fromHand: string,
  toHand: string,
  now: number,
) {
  const source = landmarks[labels.indexOf(fromHand)]
  const target = landmarks[labels.indexOf(toHand)]
  const path = source && target && [source[INDEX_MCP], source[INDEX_TIP], palmCenter(target)]

  flow.words(now, path).forEach(({ word, position, direction, opacity }) => overlay.drawWord(word, position, direction, opacity))
}

function drawListeningRipples({ landmarks, labels }: Frame, hand: string, now: number) {
  const tip = landmarks[labels.indexOf(hand)]?.[INDEX_TIP]

  if (!tip) return

  for (let ring = 0; ring < RIPPLE_RINGS; ring++) overlay.drawRipple(tip, ((now / RIPPLE_PERIOD_MS) + ring / RIPPLE_RINGS) % 1)
}

function shakeOffTitles({ landmarks, labels }: Frame, now: number) {
  const hand = landmarks[labels.indexOf(DISPLAY_HAND)]

  fallingTitles.drop(
    FINGERS.flatMap((finger) => {
      const item = itemSlots.itemAt(finger)

      return item ? [{ title: item.title, origin: hand[fingertipOf(finger)] }] : []
    }),
    now,
  )
  askQuestion.cancel()
}

function drawItemTitles({ landmarks, labels }: Frame, hiddenTitles: Set<Finger>) {
  const hand = landmarks[labels.indexOf(DISPLAY_HAND)]

  if (!hand) return

  FINGERS.forEach((finger) => {
    const item = itemSlots.itemAt(finger)

    if (item && !hiddenTitles.has(finger)) overlay.surface.label(item.title, hand[fingertipOf(finger)])
  })
}

function showDebug(
  frame: Frame,
  pinching: ReturnType<typeof trackPinch>["pinching"],
  inPalm: ReturnType<typeof indexTipsInPalms>,
  roll: Map<string, number>,
) {
  const openness = new Map(frame.labels.map((label, index) => [label, handOpenness(frame.worldLandmarks[index])]))

  $$<HTMLTableRowElement>("tr[data-hand]").forEach((row) => {
    const hand = row.dataset.hand!
    const pinch = pinching.get(hand)
    const fields = {
      pinching: pinch ? `${pinch.active ? "yes" : "no"} (${pinch.confidence.toFixed(2)})` : "—",
      openness: openness.has(hand) ? openness.get(hand)!.toFixed(2) : "—",
      roll: roll.has(hand) ? `${roll.get(hand)!.toFixed(0)}°` : "—",
      palm: inPalm.has(hand) ? (inPalm.get(hand) ? "yes" : "no") : "—",
    }

    Object.entries(fields).forEach(([field, text]) => (row.querySelector(`[data-field=${field}]`)!.textContent = text))
  })
}

const marqueeScroll = (since: number | undefined, now: number) =>
  since === undefined ? 0 : (Math.max(0, now - since - MARQUEE_DELAY_MS) / 1000) * MARQUEE_CHARS_PER_SECOND
