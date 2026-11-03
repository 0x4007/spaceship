import "./style.css";
import { createHandFilter } from "./one-euro-filter.ts";
import { measure, nearestLandmark, pinchMidpoint } from "./measurements.ts";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

const STORAGE_KEY = "handstorm.cameraId";
const NEAR = 0.05;
const HAND_COLORS = { Left: "#fff", Right: "#0f0" } as const;

const cameraSelect = document.querySelector<HTMLSelectElement>("#camera")!;
const video = document.querySelector<HTMLVideoElement>("#video")!;
const canvas = document.querySelector<HTMLCanvasElement>("#overlay")!;
const events = document.querySelector<HTMLOListElement>("#events")!;
const status = document.querySelector<HTMLOutputElement>("#status")!;
const ctx = canvas.getContext("2d")!;

let stream: MediaStream | undefined;

main();

async function main() {
  try {
    const landmarker = await createLandmarker();
    await startCamera(localStorage.getItem(STORAGE_KEY));
    await listCameras();
    document.addEventListener("pinch_on", logPinchOn);
    cameraSelect.addEventListener("change", () => {
      localStorage.setItem(STORAGE_KEY, cameraSelect.value);
      startCamera(cameraSelect.value).catch(showError);
    });
    track(landmarker);
  } catch (error) {
    showError(error);
  }
}

async function createLandmarker() {
  const vision = await FilesetResolver.forVisionTasks("/wasm");
  return HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: "/models/hand_landmarker.task", delegate: "GPU" },
    runningMode: "VIDEO",
    numHands: 2,
  });
}

async function startCamera(deviceId: string | null) {
  stream?.getTracks().forEach((track) => track.stop());
  try {
    stream = await openStream(deviceId);
  } catch (error) {
    if (!deviceId) throw error;
    localStorage.removeItem(STORAGE_KEY);
    stream = await openStream(null);
  }
  video.srcObject = stream;
  await video.play();
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const activeId = stream.getVideoTracks()[0]?.getSettings().deviceId;
  if (activeId) cameraSelect.value = activeId;
}

function openStream(deviceId: string | null) {
  return navigator.mediaDevices.getUserMedia({
    video: deviceId ? { deviceId: { exact: deviceId } } : true,
  });
}

async function listCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter((device) => device.kind === "videoinput");
  cameraSelect.replaceChildren(
    ...cameras.map((camera, index) => new Option(camera.label || `camera ${index + 1}`, camera.deviceId)),
  );
  const activeId = stream?.getVideoTracks()[0]?.getSettings().deviceId;
  if (activeId) cameraSelect.value = activeId;
}

function track(landmarker: HandLandmarker) {
  let lastVideoTime = -1;
  const filterImage = createHandFilter();
  const filterWorld = createHandFilter();

  const frame = () => {
    if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      const now = performance.now();
      const result = landmarker.detectForVideo(video, now);
      const labels = result.handedness.map(([hand]) => hand.categoryName);
      const landmarks = filterImage(result.landmarks, labels, now / 1000);
      const worldLandmarks = filterWorld(result.worldLandmarks, labels, now / 1000);
      draw(landmarks, labels);
      showMeasurements(worldLandmarks, labels);
      emitPinchEvents(landmarks, labels);
      status.value = `hands: ${landmarks.length}`;
    }
    requestAnimationFrame(frame);
  };
  frame();
}

function emitPinchEvents(hands: { x: number; y: number; z: number }[][], labels: string[]) {
  if (hands.length < 2) return;
  hands.forEach((hand, index) => {
    const otherIndex = index === 0 ? 1 : 0;
    const { landmark, distance } = nearestLandmark(pinchMidpoint(hand), hands[otherIndex]);
    if (distance >= NEAR) return;
    document.dispatchEvent(
      new CustomEvent("pinch_on", { detail: { hand: labels[index], targetHand: labels[otherIndex], landmark } }),
    );
  });
}

function logPinchOn(event: Event) {
  const { hand, targetHand, landmark } = (event as CustomEvent).detail;
  const item = document.createElement("li");
  item.textContent = `${new Date().toISOString().slice(11, 23)} pinch_on ${hand} → ${targetHand} #${landmark}`;
  events.prepend(item);
}

function showMeasurements(worldHands: { x: number; y: number; z: number }[][], labels: string[]) {
  document.querySelectorAll<HTMLTableRowElement>("tr[data-hand]").forEach((row) => {
    const index = labels.indexOf(row.dataset.hand!);
    const values = index >= 0 ? measure(worldHands[index]) : undefined;
    row.querySelectorAll<HTMLTableCellElement>("td[data-metric]").forEach((cell) => {
      const value = values?.[cell.dataset.metric as keyof typeof values];
      cell.textContent = value === undefined ? "—" : value.toFixed(2);
    });
  });
}

function draw(hands: { x: number; y: number }[][], labels: string[]) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  hands.forEach((points, index) => {
    const color = HAND_COLORS[labels[index] as keyof typeof HAND_COLORS] ?? "#fff";
    drawConnections(points, color);
    drawPoints(points, color);
  });
}

function drawConnections(points: { x: number; y: number }[], color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (const { start, end } of HandLandmarker.HAND_CONNECTIONS) {
    ctx.beginPath();
    ctx.moveTo(points[start].x * canvas.width, points[start].y * canvas.height);
    ctx.lineTo(points[end].x * canvas.width, points[end].y * canvas.height);
    ctx.stroke();
  }
}

function drawPoints(points: { x: number; y: number }[], color: string) {
  ctx.fillStyle = color;
  for (const point of points) {
    ctx.beginPath();
    ctx.arc(point.x * canvas.width, point.y * canvas.height, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function showError(error: unknown) {
  status.value = `error: ${error instanceof Error ? error.message : error}`;
}
