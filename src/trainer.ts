import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { setupCamera } from "./camera.ts";
import { drawHands } from "./draw-hands.ts";
import {
  confidence,
  createModelFile,
  extractFeatures,
  flatten,
  toPoints,
  train,
  type GestureParameters,
  type ModelFile,
  type RawSample,
} from "./gesture-model.ts";
import { createLandmarker, trackHands, type Frame } from "./hand-tracking.ts";

type ClassName = "positive" | "negative";
type Dataset = Record<string, Record<ClassName, RawSample[]>>;
type Clip = { gesture: string; className: ClassName; startTime: number; samples: (RawSample & { time: number })[] };
type ConfidenceCell = { meter: HTMLMeterElement; output: HTMLOutputElement };
type InferenceRow = { parameters: GestureParameters; cells: Record<string, ConfidenceCell> };

const DATASET_KEY = "handstorm.trainer.dataset.v2";
const TRIM_MS = 1000;
const RECORD_INTERVAL_MS = 100;
const HANDS = ["Left", "Right"];

const video = document.querySelector<HTMLVideoElement>("#video")!;
const canvas = document.querySelector<HTMLCanvasElement>("#overlay")!;
const cameraSelect = document.querySelector<HTMLSelectElement>("#camera")!;
const status = document.querySelector<HTMLOutputElement>("#status")!;
const modeForm = document.querySelector<HTMLFieldSetElement>("#mode")!;
const collectSection = document.querySelector<HTMLElement>("#collect")!;
const inferenceSection = document.querySelector<HTMLElement>("#inference")!;
const addGestureForm = document.querySelector<HTMLFormElement>("#add-gesture")!;
const gestureSelect = document.querySelector<HTMLSelectElement>("#gesture")!;
const deleteButton = document.querySelector<HTMLButtonElement>("#delete-gesture")!;
const confidences = document.querySelector<HTMLTableSectionElement>("#confidences")!;
const downloadButton = document.querySelector<HTMLButtonElement>("#download")!;

const dataset: Dataset = loadDataset();
let clip: Clip | undefined;
let lastRecordTime = 0;
let inferenceRows: InferenceRow[] = [];

main();

async function main() {
  try {
    const landmarker = await createLandmarker();
    await setupCamera(video, cameraSelect);
    cameraSelect.addEventListener("error", (event) => showError((event as ErrorEvent).error));
    bindControls();
    renderGestures();
    track(landmarker);
    status.value = "ready";
  } catch (error) {
    showError(error);
  }
}

function bindControls() {
  modeForm.addEventListener("change", () => setMode(currentMode()));
  addGestureForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addGesture(new FormData(addGestureForm).get("name") as string);
    addGestureForm.reset();
  });
  gestureSelect.addEventListener("change", () => {
    stopRecording();
    renderCounts();
  });
  deleteButton.addEventListener("click", deleteGesture);
  document.querySelectorAll<HTMLTableRowElement>("tr[data-class]").forEach((row) => {
    const className = row.dataset.class as ClassName;
    row.querySelector("[data-action=record]")!.addEventListener("click", () => toggleRecording(className));
    row.querySelector("[data-action=clear]")!.addEventListener("click", () => clearSamples(className));
  });
  downloadButton.addEventListener("click", downloadParameters);
}

function track(landmarker: HandLandmarker) {
  trackHands(video, landmarker, (frame) => {
    drawHands(canvas, frame.landmarks, frame.labels);
    if (currentMode() === "collect") record(frame);
    else infer(frame);
  });
}

function record({ worldLandmarks, labels }: Frame) {
  const now = performance.now();
  if (!clip || now - lastRecordTime < RECORD_INTERVAL_MS) return;
  lastRecordTime = now;
  status.value = `recording ${((now - clip.startTime) / 1000).toFixed(1)}s (first and last second are discarded)`;
  worldLandmarks.forEach((hand, index) => {
    clip!.samples.push({
      time: now,
      hand: labels[index],
      landmarks: flatten(hand).map((value) => Math.round(value * 1e5) / 1e5),
    });
  });
  renderCounts();
}

function infer({ worldLandmarks, labels }: Frame) {
  for (const { parameters, cells } of inferenceRows) {
    for (const hand of HANDS) {
      const index = labels.indexOf(hand);
      const value = index >= 0 ? confidence(parameters, extractFeatures(worldLandmarks[index], hand)) : undefined;
      cells[hand].meter.value = value ?? 0;
      cells[hand].output.value = value === undefined ? "—" : value.toFixed(2);
    }
  }
}

function setMode(mode: string) {
  stopRecording();
  collectSection.hidden = mode !== "collect";
  inferenceSection.hidden = mode !== "inference";
  if (mode === "inference") startInference();
}

function startInference() {
  const { trained, skipped } = trainAll();
  const created = trained.map(createInferenceRow);
  confidences.replaceChildren(...created.map(({ row }) => row));
  inferenceRows = created;
  downloadButton.disabled = trained.length === 0;
  status.value = skipped.length
    ? `skipped (need 5+ positive and negative samples): ${skipped.join(", ")}`
    : trained.length
      ? "ready"
      : "no trained gestures yet";
}

function createInferenceRow(parameters: GestureParameters) {
  const row = document.createElement("tr");
  const name = document.createElement("th");
  name.scope = "row";
  name.textContent = parameters.name;
  row.append(name);
  const cells: Record<string, ConfidenceCell> = {};
  for (const hand of HANDS) {
    const cell = document.createElement("td");
    const meter = document.createElement("meter");
    meter.max = 1;
    const output = document.createElement("output");
    output.value = "—";
    cell.append(meter, " ", output);
    row.append(cell);
    cells[hand] = { meter, output };
  }
  const validation = document.createElement("td");
  validation.textContent = parameters.validation
    ? `${(parameters.validation.accuracy * 100).toFixed(0)}% (${parameters.validation.samples} samples)`
    : "not enough samples";
  row.append(validation);
  return { row, parameters, cells };
}

function trainAll() {
  const trained: GestureParameters[] = [];
  const skipped: string[] = [];
  for (const [name, samples] of Object.entries(dataset)) {
    try {
      trained.push(train(name, { positive: toFeatures(samples.positive), negative: toFeatures(samples.negative) }));
    } catch {
      skipped.push(name);
    }
  }
  return { trained, skipped };
}

function toFeatures(samples: RawSample[]) {
  return samples.map(({ hand, landmarks }) => extractFeatures(toPoints(landmarks), hand));
}

function downloadParameters() {
  const file: ModelFile = createModelFile(inferenceRows.map(({ parameters }) => parameters));
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: "application/json" }));
  link.download = "gestures.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

function addGesture(rawName: string) {
  const name = rawName.trim();
  if (!name) return;
  dataset[name] ??= { positive: [], negative: [] };
  saveDataset();
  renderGestures(name);
}

function deleteGesture() {
  const gesture = gestureSelect.value;
  clip = undefined;
  delete dataset[gesture];
  saveDataset();
  renderGestures();
}

function clearSamples(className: ClassName) {
  const gesture = gestureSelect.value;
  if (!gesture) return;
  dataset[gesture][className] = [];
  saveDataset();
  renderCounts();
}

function toggleRecording(className: ClassName) {
  const wasRecordingSame = clip?.className === className;
  stopRecording();
  if (wasRecordingSame) return;
  if (!gestureSelect.value) return showError(new Error("add a gesture first"));
  clip = { gesture: gestureSelect.value, className, startTime: performance.now(), samples: [] };
  renderRecording();
}

function stopRecording() {
  if (clip) commitClip(clip);
  clip = undefined;
  renderRecording();
  renderCounts();
}

function commitClip({ gesture, className, startTime, samples }: Clip) {
  const endTime = performance.now();
  const kept = samples
    .filter(({ time }) => time - startTime >= TRIM_MS && endTime - time >= TRIM_MS)
    .map(({ hand, landmarks }) => ({ hand, landmarks }));
  if (!dataset[gesture]) return;
  dataset[gesture][className].push(...kept);
  saveDataset();
  status.value = kept.length
    ? `saved ${kept.length} ${className} samples`
    : "nothing saved: record for more than 2 seconds, the first and last second are discarded";
}

function renderGestures(selected = gestureSelect.value) {
  const names = Object.keys(dataset);
  gestureSelect.replaceChildren(...names.map((name) => new Option(name, name)));
  if (names.includes(selected)) gestureSelect.value = selected;
  deleteButton.disabled = names.length === 0;
  stopRecording();
}

function renderCounts() {
  const samples = dataset[gestureSelect.value];
  document.querySelectorAll<HTMLTableRowElement>("tr[data-class]").forEach((row) => {
    const className = row.dataset.class as ClassName;
    const saved = samples?.[className].length ?? 0;
    const pending = clip?.gesture === gestureSelect.value && clip.className === className ? clip.samples.length : 0;
    row.querySelector("output")!.value = pending ? `${saved} (+${pending} recording)` : String(saved);
  });
}

function renderRecording() {
  document.querySelectorAll<HTMLTableRowElement>("tr[data-class]").forEach((row) => {
    const pressed = row.dataset.class === clip?.className;
    const button = row.querySelector<HTMLButtonElement>("[data-action=record]")!;
    button.setAttribute("aria-pressed", String(pressed));
    button.textContent = pressed ? "stop" : "record";
  });
}

function currentMode() {
  return modeForm.querySelector<HTMLInputElement>("input:checked")!.value;
}

function loadDataset(): Dataset {
  try {
    return JSON.parse(localStorage.getItem(DATASET_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveDataset() {
  try {
    localStorage.setItem(DATASET_KEY, JSON.stringify(dataset));
  } catch (error) {
    showError(error);
  }
}

function showError(error: unknown) {
  status.value = `error: ${error instanceof Error ? error.message : error}`;
}
