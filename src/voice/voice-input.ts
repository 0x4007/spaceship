import { showError } from "../dom.ts"
import { INDEX_MCP, INDEX_TIP } from "../gesture/landmarks.ts"
import { palmCenter } from "../gesture/palm.ts"
import { ACTING_HAND, DISPLAY_HAND } from "../hands.ts"
import type { Point } from "../point.ts"
import { handLandmarks, type Frame } from "../tracking/hand-tracking.ts"
import { announce } from "../feedback.ts"
import type { Overlay } from "../tracking/overlay.ts"
import { createPalmListener } from "./palm-listener.ts"
import { createTranscriptFlow } from "./transcript-flow.ts"

const RIPPLE_RINGS = 3
const RIPPLE_PERIOD_MS = 1200

export type SpeechReading = { listening: boolean; partial: string; transcript: string; failed: boolean }

type Dependencies = { overlay: Overlay; status: HTMLOutputElement; onQuestion: (question: string) => void }

export function createVoiceInput({ overlay, status, onQuestion }: Dependencies) {
  const channels = [
    createChannel(ACTING_HAND, DISPLAY_HAND, onQuestion),
    createChannel(DISPLAY_HAND, ACTING_HAND, (text) => (status.value = `heard: ${text}`)),
  ]

  return {
    readings: () => new Map(channels.map((channel) => [channel.speaker, channel.reading()])),

    drawWords: (frame: Frame, now: number) => channels.forEach((channel) => channel.drawWords(frame, now)),

    update: (frame: Frame, indexInPalm: Map<string, boolean>, now: number) =>
      channels.forEach((channel) => channel.update(frame, indexInPalm.get(channel.speaker) ?? false, now)),
  }

  function createChannel(speaker: string, listener: string, onTranscript: (text: string) => void) {
    const flow = createTranscriptFlow()
    let listening = false
    let inPalm = false
    let partial = ""
    let transcript = ""
    let failed = false

    const listenWhenInPalm = createPalmListener({
      onListen: () => {
        flow.reset()
        listening = true
        partial = ""
        failed = false
        announce("listen", speaker)
        status.value = "listening…"
      },
      onPartial: (text) => {
        partial = text
        flow.push(text)
      },
      onTranscript: (text) => {
        flow.push(text, true)
        listening = false
        partial = ""
        transcript = text
        onTranscript(text)
      },
      onError: (error) => {
        listening = false
        failed = true
        showError(status, error)
      },
    })

    return {
      speaker,

      reading: (): SpeechReading => ({ listening: listening && inPalm, partial, transcript, failed }),

      drawWords(frame: Frame, now: number) {
        const source = handLandmarks(frame, speaker)
        const target = handLandmarks(frame, listener)
        const path = source && target && [source[INDEX_MCP], source[INDEX_TIP], palmCenter(target)]

        flow.words(now, path).forEach(({ word, position, direction, opacity }) => overlay.drawWord(word, position, direction, opacity))
      },

      update(frame: Frame, indexInPalm: boolean, now: number) {
        inPalm = indexInPalm
        listenWhenInPalm(indexInPalm)
        if (indexInPalm && listening) drawRipples(handLandmarks(frame, speaker)?.[INDEX_TIP], now)
      },
    }
  }

  function drawRipples(tip: Point | undefined, now: number) {
    if (!tip) return

    for (let ring = 0; ring < RIPPLE_RINGS; ring++) overlay.drawRipple(tip, (now / RIPPLE_PERIOD_MS + ring / RIPPLE_RINGS) % 1)
  }
}
