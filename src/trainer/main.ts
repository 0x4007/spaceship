import { $, $$, downloadJson, showError } from "../dom.ts"
import { createGestureClassifier } from "../gesture/inference.ts"
import { createModelFile } from "../gesture/model-file.ts"
import { MIN_SAMPLES, train, type TrainedGesture } from "../gesture/training.ts"
import { startTracking, type Frame } from "../tracking/hand-tracking.ts"
import { createOverlay } from "../tracking/overlay.ts"
import { createDataset, type ClassName } from "./dataset.ts"
import { createInferenceView } from "./inference-view.ts"
import { createRecorder } from "./recorder.ts"

const video = $<HTMLVideoElement>("#video")
const cameraSelect = $<HTMLSelectElement>("#camera")
const status = $<HTMLOutputElement>("#status")
const gestureSelect = $<HTMLSelectElement>("#gesture")
const deleteButton = $<HTMLButtonElement>("#delete-gesture")
const downloadButton = $<HTMLButtonElement>("#download")
const classRows = $$<HTMLTableRowElement>("tr[data-class]")

const overlay = createOverlay($<HTMLCanvasElement>("#overlay"), video)
const inferenceView = createInferenceView($<HTMLTableSectionElement>("#confidences"))
const dataset = createDataset((error) => showError(status, error))
const recorder = createRecorder()
let inference = { gestures: [] as TrainedGesture[], classify: createGestureClassifier({ gestures: [] }) }

bindControls()
renderGestures()

startTracking({ video, cameraSelect, onFrame: handleFrame, onError: (error) => showError(status, error) })
  .then(() => (status.value = "ready"))
  .catch((error) => showError(status, error))

function bindControls() {
  const addGestureForm = $<HTMLFormElement>("#add-gesture")

  $("#mode").addEventListener("change", () => setMode(currentMode()))
  addGestureForm.addEventListener("submit", (event) => {
    event.preventDefault()
    addGesture(new FormData(addGestureForm).get("name") as string)
    addGestureForm.reset()
  })
  gestureSelect.addEventListener("change", finishRecording)
  deleteButton.addEventListener("click", deleteGesture)
  downloadButton.addEventListener("click", () => downloadJson("gestures.json", createModelFile(inference.gestures)))

  classRows.forEach((row) => {
    const className = row.dataset.class as ClassName

    row.querySelector("[data-action=record]")!.addEventListener("click", () => toggleRecording(className))
    row.querySelector("[data-action=clear]")!.addEventListener("click", () => clearSamples(className))
  })
}

function handleFrame(frame: Frame) {
  overlay.drawHands(frame.landmarks, frame.labels)

  if (currentMode() === "collect") collect(frame)
  else infer(frame)
}

function collect(frame: Frame) {
  if (!recorder.capture(frame)) return

  status.value = `recording ${recorder.elapsedSeconds().toFixed(1)}s (first and last second are discarded)`
  renderCounts()
}

const infer = ({ worldLandmarks, labels }: Frame) =>
  inferenceView.update(new Map(labels.map((label, index) => [label, inference.classify(worldLandmarks[index], label)])))

function setMode(mode: string) {
  finishRecording()
  $("#collect").hidden = mode !== "collect"
  $("#inference").hidden = mode !== "inference"

  if (mode === "inference") startInference()
}

function startInference() {
  const { trained, skipped } = trainAll()

  inference = { gestures: trained, classify: createGestureClassifier({ gestures: trained }) }
  inferenceView.show(trained)
  downloadButton.disabled = trained.length === 0
  status.value = skipped.length
    ? `skipped (need ${MIN_SAMPLES}+ positive and negative samples): ${skipped.join(", ")}`
    : trained.length
      ? "ready"
      : "no trained gestures yet"
}

function trainAll() {
  const trained: TrainedGesture[] = []
  const skipped: string[] = []

  dataset.trainingSets().forEach(({ name, ...features }) => {
    try {
      trained.push(train(name, features))
    } catch {
      skipped.push(name)
    }
  })

  return { trained, skipped }
}

function addGesture(rawName: string) {
  const name = rawName.trim()

  if (!name) return

  dataset.add(name)
  renderGestures(name)
}

function deleteGesture() {
  recorder.cancel()
  dataset.remove(gestureSelect.value)
  renderGestures()
}

function clearSamples(className: ClassName) {
  if (!gestureSelect.value) return

  dataset.clear(gestureSelect.value, className)
  renderCounts()
}

function toggleRecording(className: ClassName) {
  const wasRecordingSameClass = recorder.current()?.className === className

  finishRecording()

  if (wasRecordingSameClass) return
  if (!gestureSelect.value) return showError(status, new Error("add a gesture first"))

  recorder.start(gestureSelect.value, className)
  renderRecording()
}

function finishRecording() {
  const clip = recorder.stop()

  if (clip && dataset.has(clip.gesture)) {
    dataset.append(clip.gesture, clip.className, clip.samples)
    status.value = clip.samples.length
      ? `saved ${clip.samples.length} ${clip.className} samples`
      : "nothing saved: record for more than 2 seconds, the first and last second are discarded"
  }

  renderRecording()
  renderCounts()
}

function renderGestures(selected = gestureSelect.value) {
  const names = dataset.names()

  gestureSelect.replaceChildren(...names.map((name) => new Option(name, name)))
  if (names.includes(selected)) gestureSelect.value = selected

  deleteButton.disabled = names.length === 0
  finishRecording()
}

function renderCounts() {
  classRows.forEach((row) => {
    const className = row.dataset.class as ClassName
    const saved = dataset.count(gestureSelect.value, className)
    const pending = recorder.pendingCount(gestureSelect.value, className)

    row.querySelector("output")!.value = pending ? `${saved} (+${pending} recording)` : String(saved)
  })
}

function renderRecording() {
  classRows.forEach((row) => {
    const pressed = row.dataset.class === recorder.current()?.className
    const button = row.querySelector<HTMLButtonElement>("[data-action=record]")!

    button.setAttribute("aria-pressed", String(pressed))
    button.textContent = pressed ? "stop" : "record"
  })
}

const currentMode = () => $<HTMLInputElement>("#mode input:checked").value
