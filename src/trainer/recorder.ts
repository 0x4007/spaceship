import type { Frame } from "../tracking/hand-tracking.ts"
import type { ClassName } from "./dataset.ts"
import { toSample } from "./sample.ts"

const CAPTURE_INTERVAL_MS = 100
const TRIM_MS = 1000

export function createRecorder() {
  let clip: { gesture: string; className: ClassName; startTime: number; samples: ReturnType<typeof timedSamples> } | undefined
  let lastCaptureTime = 0

  return {
    current: () => clip && { gesture: clip.gesture, className: clip.className },
    pendingCount: (gesture: string, className: ClassName) =>
      clip?.gesture === gesture && clip.className === className ? clip.samples.length : 0,
    elapsedSeconds: () => (clip ? (performance.now() - clip.startTime) / 1000 : 0),
    cancel: () => (clip = undefined),

    start(gesture: string, className: ClassName) {
      clip = { gesture, className, startTime: performance.now(), samples: [] }
    },

    capture({ worldLandmarks, labels }: Frame) {
      const now = performance.now()

      if (!clip || now - lastCaptureTime < CAPTURE_INTERVAL_MS) return false

      lastCaptureTime = now
      clip.samples.push(...timedSamples(worldLandmarks, labels, now))

      return true
    },

    stop() {
      if (!clip) return undefined

      const { gesture, className, startTime, samples } = clip
      const endTime = performance.now()

      clip = undefined

      return {
        gesture,
        className,
        samples: samples
          .filter(({ time }) => time - startTime >= TRIM_MS && endTime - time >= TRIM_MS)
          .map(({ sample }) => sample),
      }
    },
  }
}

const timedSamples = (worldLandmarks: Frame["worldLandmarks"], labels: string[], time: number) =>
  worldLandmarks.map((hand, index) => ({ time, sample: toSample(hand, labels[index]) }))
