import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import type { Point } from "./measurements.ts";
import { createHandFilter } from "./one-euro-filter.ts";

export type Hand = Point[];
export type Frame = { landmarks: Hand[]; worldLandmarks: Hand[]; labels: string[] };

export async function createLandmarker() {
  const vision = await FilesetResolver.forVisionTasks("/wasm");
  return HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: "/models/hand_landmarker.task", delegate: "GPU" },
    runningMode: "VIDEO",
    numHands: 2,
  });
}

export function trackHands(video: HTMLVideoElement, landmarker: HandLandmarker, onFrame: (frame: Frame) => void) {
  let lastVideoTime = -1;
  const filterImage = createHandFilter();
  const filterWorld = createHandFilter();

  const step = () => {
    if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      const now = performance.now();
      const result = landmarker.detectForVideo(video, now);
      const labels = result.handedness.map(([hand]) => hand.categoryName);
      onFrame({
        landmarks: filterImage(result.landmarks, labels, now / 1000),
        worldLandmarks: filterWorld(result.worldLandmarks, labels, now / 1000),
        labels,
      });
    }
    requestAnimationFrame(step);
  };
  step();
}
