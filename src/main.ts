import "@fontsource/inter/500.css"
import "./style.css"
import { bindApiKeyForm } from "./api-key-form.ts"
import { createAsker } from "./chat/ask.ts"
import { createItemSlots } from "./chat/item-slots.ts"
import { createItemTitles } from "./chat/item-titles.ts"
import { showDebug } from "./debug-table.ts"
import { $, showError } from "./dom.ts"
import { handOpenness } from "./gesture/openness.ts"
import { indexTipsInPalms } from "./gesture/palm.ts"
import { handRoll } from "./gesture/rotation.ts"
import { createShakeDetector } from "./gesture/shake.ts"
import { DISPLAY_HAND } from "./hands.ts"
import { announcePinches, createPinchTracker } from "./interaction/pinch.ts"
import { createPulls } from "./interaction/pulls.ts"
import { KEY_STORAGE as CEREBRAS_KEY_STORAGE } from "./llm/cerebras.ts"
import { createPlacedTexts } from "./tools/text.ts"
import { handLandmarks, measureHands, startTracking, type Frame } from "./tracking/hand-tracking.ts"
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
const askQuestion = createAsker(itemSlots, status)
const voice = createVoiceInput({ overlay, status, onQuestion: askQuestion })
const pulls = createPulls({ video, overlay, itemSlots, placedTexts })
const trackPinch = createPinchTracker()
const detectShake = createShakeDetector()

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
  placedTexts.draw(overlay.surface)
  voice.drawWords(frame, now)

  const hiddenTitles = pulls(targets, aspectRatio, now)
  const displayRoll = roll.get(DISPLAY_HAND)

  if (displayRoll !== undefined && detectShake(DISPLAY_HAND, displayRoll, now)) shakeOff(frame, now)

  itemTitles.draw(handLandmarks(frame, DISPLAY_HAND), hiddenTitles, now)
  voice.update(frame, indexInPalm, now)
  video.classList.toggle("dimmed", overlay.hasText())
  showDebug({ pinching, roll, indexInPalm, openness: measureHands(frame, handOpenness) })
  announcePinches(targets)

  status.value = `hands: ${frame.landmarks.length}`
}

function shakeOff(frame: Frame, now: number) {
  itemTitles.shakeOff(handLandmarks(frame, DISPLAY_HAND)!, now)
  askQuestion.cancel()
}
