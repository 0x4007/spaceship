import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { setupCamera } from "./camera.ts";
import { drawHands, drawPinchTarget } from "./draw-hands.ts";
import { confidence, extractFeatures } from "./gesture-model.ts";
import { createLandmarker, trackHands, type Hand } from "./hand-tracking.ts";
import { nearestLandmark, pinchMidpoint } from "./measurements.ts";
import pinchFile from "./pinch.json";
import "./style.css";

const NEAR = 0.02;
const PINCH_ON_THRESHOLD = 0.9;
const PINCH_OFF_THRESHOLD = 0.8;
const pinchModel = pinchFile.gestures[0];

type Pinch = { confidence: number; active: boolean };
type Latch = { targetHand: string; landmark: number };

let previousPinching = new Map<string, Pinch>();
const latches = new Map<string, Latch>();

const cameraSelect = document.querySelector<HTMLSelectElement>("#camera")!;
const video = document.querySelector<HTMLVideoElement>("#video")!;
const canvas = document.querySelector<HTMLCanvasElement>("#overlay")!;
const status = document.querySelector<HTMLOutputElement>("#status")!;

main();

async function main() {
  try {
    const landmarker = await createLandmarker();
    await setupCamera(video, cameraSelect);
    cameraSelect.addEventListener("error", (event) => showError((event as ErrorEvent).error));
    track(landmarker);
  } catch (error) {
    showError(error);
  }
}

function track(landmarker: HandLandmarker) {
  trackHands(video, landmarker, ({ landmarks, worldLandmarks, labels }) => {
    const pinching = detectPinching(worldLandmarks, labels);
    const targets = findPinchTargets(landmarks, labels, pinching);
    drawHands(canvas, landmarks, labels);
    targets.forEach(({ midpoint, tip }) => drawPinchTarget(canvas, midpoint, NEAR, tip));
    showPinching(pinching);
    targets.forEach(emitPinchOn);
    status.value = `hands: ${landmarks.length}`;
  });
}

function detectPinching(worldHands: Hand[], labels: string[]) {
  const pinching = new Map<string, Pinch>(
    labels.map((label, index) => {
      const value = confidence(pinchModel, extractFeatures(worldHands[index], label));
      const wasActive = previousPinching.get(label)?.active ?? false;
      const active = value >= PINCH_ON_THRESHOLD || (wasActive && value >= PINCH_OFF_THRESHOLD);
      return [label, { confidence: value, active }];
    }),
  );
  previousPinching = pinching;
  return pinching;
}

function showPinching(pinching: Map<string, Pinch>) {
  document.querySelectorAll<HTMLTableCellElement>("tr[data-hand] td[data-metric='pinching']").forEach((cell) => {
    const pinch = pinching.get(cell.parentElement!.dataset.hand!);
    cell.textContent = pinch ? `${pinch.active ? "yes" : "no"} (${pinch.confidence.toFixed(2)})` : "—";
  });
}

function findPinchTargets(hands: Hand[], labels: string[], pinching: Map<string, Pinch>) {
  const aspectRatio = video.videoWidth / video.videoHeight;
  for (const label of latches.keys()) {
    if (!pinching.get(label)?.active) latches.delete(label);
  }
  return hands.flatMap((hand, index) => {
    const label = labels[index];
    if (!pinching.get(label)?.active) return [];
    const midpoint = pinchMidpoint(hand);
    const otherIndex = 1 - index;
    const other = hands[otherIndex];
    if (latches.get(label)?.targetHand !== labels[otherIndex]) latches.delete(label);
    if (other && !latches.has(label)) {
      const nearest = nearestLandmark(midpoint, other, aspectRatio);
      if (nearest.distance < NEAR) latches.set(label, { targetHand: labels[otherIndex], landmark: nearest.landmark });
    }
    const latch = latches.get(label);
    return [
      {
        hand: label,
        midpoint,
        targetHand: latch?.targetHand,
        landmark: latch?.landmark,
        tip: latch && other?.[latch.landmark],
      },
    ];
  });
}

function emitPinchOn({ hand, targetHand, landmark }: ReturnType<typeof findPinchTargets>[number]) {
  if (landmark === undefined) return;
  document.dispatchEvent(new CustomEvent("pinch_on", { detail: { hand, targetHand, landmark } }));
}

function showError(error: unknown) {
  status.value = `error: ${error instanceof Error ? error.message : error}`;
}
