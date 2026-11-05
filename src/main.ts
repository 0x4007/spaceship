import "@fontsource/inter/500.css"
import "./style.css"
import { bindApiKeyForm } from "./api-key-form.ts"
import { createAsker } from "./chat/ask.ts"
import { createItemSlots } from "./chat/item-slots.ts"
import { createItemTitles } from "./chat/item-titles.ts"
import { createDashboard, type Readings } from "./dashboard/dashboard.ts"
import { $, showError } from "./dom.ts"
import { announce } from "./feedback.ts"
import { FINGERS } from "./fingers.ts"
import { handOpenness } from "./gesture/openness.ts"
import { indexTipsInPalms, palmCenter } from "./gesture/palm.ts"
import { handRoll } from "./gesture/rotation.ts"
import { createShakeDetector } from "./gesture/shake.ts"
import { createWipeDetector } from "./gesture/wipe.ts"
import { ACTING_HAND, DISPLAY_HAND } from "./hands.ts"
import { createCollection } from "./interaction/collection.ts"
import { announcePinches, createPinchTracker } from "./interaction/pinch.ts"
import { createPulls } from "./interaction/pulls.ts"
import { KEY_STORAGE as CEREBRAS_KEY_STORAGE } from "./llm/cerebras.ts"
import { createPlacedTexts } from "./tools/text.ts"
import { handLandmarks, measureHands, startTracking, type Frame } from "./tracking/hand-tracking.ts"
import { bindSoundToggle } from "./sound/sound-toggle.ts"
import { createOverlay } from "./tracking/overlay.ts"
import { createVoiceInput } from "./voice/voice-input.ts"
import { API_KEY_STORAGE as ELEVENLABS_KEY_STORAGE } from "./voice/transcribe.ts"

const cameraSelect = $<HTMLSelectElement>("#camera")
const skeletonCheckbox = $<HTMLInputElement>("#skeleton")
const video = $<HTMLVideoElement>("#video")
const status = $<HTMLOutputElement>("#status")

const overlay = createOverlay($<HTMLCanvasElement>("#overlay"), video)
const placedTexts = createPlacedTexts()
const itemSlots = createItemSlots()
const itemTitles = createItemTitles(itemSlots, overlay.surface)
const collection = createCollection(overlay, placedTexts)
const askQuestion = createAsker(itemSlots, status)
const voice = createVoiceInput({ overlay, status, onQuestion: commitQuestion })
const pulls = createPulls({ video, overlay, itemSlots, placedTexts })
const trackPinch = createPinchTracker()
const detectShake = createShakeDetector()
const detectWipe = createWipeDetector()
const dashboard = createDashboard(status)

bindSoundToggle($<HTMLInputElement>("#sound"))
bindApiKeyForm($<HTMLFormElement>("#elevenlabs-key-form"), status, ELEVENLABS_KEY_STORAGE, "elevenlabs")
bindApiKeyForm($<HTMLFormElement>("#cerebras-key-form"), status, CEREBRAS_KEY_STORAGE, "cerebras")

startTracking({ video, cameraSelect, onFrame: showFrame, onError: (error) => showError(status, error) }).catch((error) =>
  showError(status, error),
)

function showFrame(frame: Frame) {
  const now = performance.now()
  const aspectRatio = video.videoWidth / video.videoHeight
  const { pinching, targets } = trackPinch(frame, aspectRatio)
  const roll = measureHands(frame, handRoll)
  const indexInPalm = indexTipsInPalms(frame.landmarks, frame.labels, aspectRatio)

  overlay.drawHands(frame.landmarks, frame.labels, skeletonCheckbox.checked)
  placedTexts.draw(overlay.surface, now)
  voice.drawWords(frame, now)

  const hiddenTitles = pulls.update(targets, aspectRatio, now, skeletonCheckbox.checked)
  const displayRoll = roll.get(DISPLAY_HAND)

  if (displayRoll !== undefined && detectShake(DISPLAY_HAND, displayRoll, now)) shakeOff(frame, now)

  frame.labels.forEach((hand, index) => {
    const handRollDegrees = roll.get(hand)
    const wiped = handRollDegrees !== undefined && !pinching.get(hand)?.active && detectWipe(hand, palmCenter(frame.landmarks[index]), handRollDegrees, aspectRatio, now)

    if (wiped) clearBoard(now)
  })

  collection.update(frame, aspectRatio, now)

  if (roll.has(ACTING_HAND) && detectShake(ACTING_HAND, roll.get(ACTING_HAND)!, now)) {
    announce("shakeOff", ACTING_HAND)
    pulls.dropHeld(ACTING_HAND, now)
    collection.snap(now)
  }

  itemTitles.draw(handLandmarks(frame, DISPLAY_HAND), hiddenTitles, now)
  voice.update(frame, indexInPalm, now)
  video.classList.toggle("dimmed", overlay.hasText())
  const openness = measureHands(frame, handOpenness)

  dashboard.update(readingsOf(frame, { pinching, openness, roll, indexInPalm }), now)
  announcePinches(targets)

  status.value = `hands: ${frame.landmarks.length}`
}

function shakeOff(frame: Frame, now: number) {
  announce("shakeOff", DISPLAY_HAND)
  itemTitles.shakeOff(handLandmarks(frame, DISPLAY_HAND)!, now)
  askQuestion.cancel()
}

function readingsOf(frame: Frame, measured: Pick<Readings, "pinching" | "openness" | "roll" | "indexInPalm">): Readings {
  return {
    ...measured,
    pulls: pulls.readings(),
    shakes: new Map(frame.labels.map((hand) => [hand, detectShake.reversals(hand)])),
    wipes: new Map(frame.labels.map((hand) => [hand, detectWipe.inspect(hand)])),
    hands: frame.landmarks.length,
    links: collection.items().length,
    placed: placedTexts.count(),
    slots: FINGERS.map((finger) => itemSlots.itemAt(finger)?.title),
    llm: askQuestion.run(),
    speech: voice.readings(),
  }
}

function clearBoard(now: number) {
  collection.retract(now)
  const cleared = placedTexts.clear(now)

  if (cleared > 0) announce("cleared", `${cleared} texts`)
}

function commitQuestion(question: string) {
  const context = collection.items().map(({ text }) => text)

  collection.retract(performance.now())
  askQuestion(question, context)
}
