import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision"
import type { Point } from "../gesture/geometry.ts"
import { setupCamera } from "./camera.ts"
import { createHandFilter } from "./one-euro-filter.ts"

export type Frame = { landmarks: Point[][]; worldLandmarks: Point[][]; labels: string[] }

export const handLandmarks = ({ landmarks, labels }: Frame, hand: string): Point[] | undefined => landmarks[labels.indexOf(hand)]

export const measureHands = <T>({ worldLandmarks, labels }: Frame, measure: (world: Point[], hand: string) => T) =>
  new Map(labels.map((hand, index) => [hand, measure(worldLandmarks[index], hand)]))

export async function startTracking({
  video,
  cameraSelect,
  onFrame,
  onError,
}: {
  video: HTMLVideoElement
  cameraSelect: HTMLSelectElement
  onFrame: (frame: Frame) => void
  onError: (error: unknown) => void
}) {
  const landmarker = await createLandmarker()

  await setupCamera(video, cameraSelect, onError)
  trackFrames(video, landmarker, onFrame)
}

async function createLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}wasm`)

  return HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}models/hand_landmarker.task`, delegate: "GPU" },
    runningMode: "VIDEO",
    numHands: 2,
  })
}

function trackFrames(video: HTMLVideoElement, landmarker: HandLandmarker, onFrame: (frame: Frame) => void) {
  const filterLandmarks = createHandFilter()
  const filterWorldLandmarks = createHandFilter()
  let lastVideoTime = -1

  const step = () => {
    if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime

      const now = performance.now()
      const result = landmarker.detectForVideo(video, now)
      const labels = result.handedness.map(([hand]) => hand.categoryName)

      onFrame({
        landmarks: filterLandmarks(result.landmarks, labels, now / 1000),
        worldLandmarks: filterWorldLandmarks(result.worldLandmarks, labels, now / 1000),
        labels,
      })
    }

    requestAnimationFrame(step)
  }

  step()
}
