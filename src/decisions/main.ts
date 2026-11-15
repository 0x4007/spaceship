import { $, showError, showStopOrError } from "../dom.ts"
import { renderAnswers, renderUsage } from "./answer-view.ts"
import { createDecisions, KEY_STORAGE, type ContentBlock, type DecisionRequest, type DecisionResponse, type Resolution } from "../llm/decisions.ts"
import {
  createCamera,
  createRecorder,
  fillDeviceSelect,
  grantMediaAccess,
  openMic,
  openScreen,
  toBase64,
  VIDEO_MIME_TYPE,
  type CapturedMedia,
} from "./media-capture.ts"
import { createQuestionEditor, PRESETS } from "./question-editor.ts"

const keyForm = $<HTMLFormElement>("#key-form")
const keyInput = $<HTMLInputElement>("#api-key")
const keyStatus = $<HTMLOutputElement>("#key-status")
const decideForm = $<HTMLFormElement>("#decide-form")
const grantButton = $<HTMLButtonElement>("#grant")
const deviceStatus = $<HTMLOutputElement>("#device-status")
const textInput = $<HTMLTextAreaElement>("#text")
const cameraSelect = $<HTMLSelectElement>("#camera")
const cameraToggle = $<HTMLButtonElement>("#camera-toggle")
const snapshotButton = $<HTMLButtonElement>("#snapshot")
const clearImageButton = $<HTMLButtonElement>("#clear-image")
const resolutionSelect = $<HTMLSelectElement>("#resolution")
const cameraPreview = $<HTMLVideoElement>("#camera-preview")
const imagePreview = $<HTMLImageElement>("#image-preview")
const micSelect = $<HTMLSelectElement>("#mic")
const recordButton = $<HTMLButtonElement>("#record")
const clearAudioButton = $<HTMLButtonElement>("#clear-audio")
const audioPreview = $<HTMLAudioElement>("#audio-preview")
const recordScreenButton = $<HTMLButtonElement>("#record-screen")
const screenMicInput = $<HTMLInputElement>("#screen-mic")
const clearVideoButton = $<HTMLButtonElement>("#clear-video")
const videoResolutionSelect = $<HTMLSelectElement>("#video-resolution")
const videoPreview = $<HTMLVideoElement>("#video-preview")
const videoStatus = $<HTMLOutputElement>("#video-status")
const presetSelect = $<HTMLSelectElement>("#preset")
const loadPresetButton = $<HTMLButtonElement>("#load-preset")
const addQuestionButton = $<HTMLButtonElement>("#add-question")
const modelInput = $<HTMLInputElement>("#model")
const thresholdInput = $<HTMLInputElement>("#threshold")
const thresholdValue = $<HTMLOutputElement>("#threshold-value")
const decideButton = $<HTMLButtonElement>("#decide")
const stopButton = $<HTMLButtonElement>("#stop")
const status = $<HTMLOutputElement>("#status")
const usageList = $<HTMLDListElement>("#usage")
const answersView = $("#answers")
const requestJson = $("#request-json")
const responseJson = $("#response-json")

const camera = createCamera(cameraPreview)
const mic = createRecorder((media) => {
  setAudio(media)
  recordButton.textContent = "record"
})
const screen = createRecorder((media) => {
  setVideo(media)
  recordScreenButton.textContent = "record screen"
  videoStatus.value = `${(media.blob.size / 1e6).toFixed(1)} MB ${media.mimeType}`
})
const editor = createQuestionEditor($("#questions"), $<HTMLTemplateElement>("#question-template"))

let image: CapturedMedia | undefined
let audio: CapturedMedia | undefined
let video: CapturedMedia | undefined
let lastResponse: DecisionResponse | undefined
let controller: AbortController | undefined

keyInput.value = localStorage.getItem(KEY_STORAGE) ?? ""
keyStatus.value = keyInput.value ? "key loaded" : ""
keyForm.addEventListener("submit", (event) => {
  event.preventDefault()
  localStorage.setItem(KEY_STORAGE, keyInput.value.trim())
  keyStatus.value = "saved"
})

presetSelect.append(...Object.keys(PRESETS).map((name) => new Option(name)))
editor.load(Object.values(PRESETS)[0])
loadPresetButton.addEventListener("click", () => editor.load(PRESETS[presetSelect.value]))
addQuestionButton.addEventListener("click", () => editor.add())

refreshDevices()
navigator.mediaDevices.addEventListener("devicechange", refreshDevices)
grantButton.addEventListener("click", async () => {
  try {
    await grantMediaAccess()
    deviceStatus.value = "access granted"
  } catch (error) {
    showError(deviceStatus, error)
  }
  await refreshDevices()
})

cameraToggle.addEventListener("click", async () => {
  try {
    if (camera.isOn()) camera.stop()
    else await camera.start(cameraSelect.value)
  } catch (error) {
    showError(deviceStatus, error)
  }
  cameraToggle.textContent = camera.isOn() ? "stop camera" : "start camera"
  cameraPreview.hidden = !camera.isOn()
  await refreshDevices()
})
cameraSelect.addEventListener("change", () => camera.isOn() && camera.start(cameraSelect.value).catch((error) => showError(deviceStatus, error)))
snapshotButton.addEventListener("click", async () => {
  try {
    setImage(await camera.capture())
  } catch (error) {
    showError(deviceStatus, error)
  }
})
clearImageButton.addEventListener("click", () => setImage(undefined))

recordButton.addEventListener("click", async () => {
  try {
    if (mic.isRecording()) return mic.stop()
    mic.start(await openMic(micSelect.value))
    recordButton.textContent = "stop recording"
  } catch (error) {
    showError(deviceStatus, error)
  }
  await refreshDevices()
})
clearAudioButton.addEventListener("click", () => setAudio(undefined))

recordScreenButton.addEventListener("click", async () => {
  try {
    if (screen.isRecording()) return screen.stop()
    const capture = await openScreen(screenMicInput.checked)
    setVideo(undefined)
    videoPreview.srcObject = capture.stream
    videoPreview.hidden = false
    await videoPreview.play()
    screen.start(capture, VIDEO_MIME_TYPE)
    recordScreenButton.textContent = "stop recording"
    videoStatus.value = "recording…"
  } catch (error) {
    showError(videoStatus, error)
  }
})
clearVideoButton.addEventListener("click", () => {
  setVideo(undefined)
  videoStatus.value = ""
})

thresholdInput.addEventListener("input", () => {
  thresholdValue.value = Number(thresholdInput.value).toFixed(2)
  if (lastResponse) renderAnswers(answersView, lastResponse, Number(thresholdInput.value))
})

stopButton.addEventListener("click", () => controller?.abort())
decideForm.addEventListener("submit", async (event) => {
  event.preventDefault()
  await decide()
})

async function decide() {
  const apiKey = localStorage.getItem(KEY_STORAGE)?.trim()
  if (!apiKey) {
    status.value = "error: save an API key first"
    return
  }

  controller = new AbortController()
  setBusy(true)
  status.value = "deciding…"
  try {
    const request: DecisionRequest = { model: modelInput.value.trim(), input: await buildInput(), questions: editor.read() }
    requestJson.textContent = JSON.stringify(request, truncateData, 2)
    const started = performance.now()
    const response = await createDecisions(apiKey, request, controller.signal)
    lastResponse = response
    responseJson.textContent = JSON.stringify(response, null, 2)
    renderUsage(usageList, response, performance.now() - started)
    renderAnswers(answersView, response, Number(thresholdInput.value))
    status.value = "done"
  } catch (error) {
    showStopOrError(status, error)
  } finally {
    setBusy(false)
  }
}

async function buildInput() {
  const blocks: ContentBlock[] = []
  if (textInput.value.trim()) blocks.push({ type: "text", text: textInput.value })
  if (image) {
    const resolution = resolutionSelect.value as Resolution | ""
    blocks.push({ type: "image", data: await toBase64(image.blob), mime_type: image.mimeType, ...(resolution && { resolution }) })
  }
  if (audio) blocks.push({ type: "audio", data: await toBase64(audio.blob), mime_type: audio.mimeType })
  if (video) {
    const resolution = videoResolutionSelect.value as Exclude<Resolution, "ultra_high"> | ""
    blocks.push({ type: "video", data: await toBase64(video.blob), mime_type: video.mimeType, ...(resolution && { resolution }) })
  }
  if (!blocks.length) throw new Error("provide text, a snapshot, an audio or a screen recording")
  return blocks.length === 1 && blocks[0].type === "text" ? blocks[0].text : blocks
}

async function refreshDevices() {
  await Promise.all([fillDeviceSelect(cameraSelect, "videoinput"), fillDeviceSelect(micSelect, "audioinput")])
}

function setImage(media: CapturedMedia | undefined) {
  image = media
  replacePreview(imagePreview, media)
}

function setAudio(media: CapturedMedia | undefined) {
  audio = media
  replacePreview(audioPreview, media)
}

function setVideo(media: CapturedMedia | undefined) {
  video = media
  replacePreview(videoPreview, media)
}

function replacePreview(preview: HTMLImageElement | HTMLMediaElement, media: CapturedMedia | undefined) {
  if ("srcObject" in preview) preview.srcObject = null
  if (preview.src) URL.revokeObjectURL(preview.src)
  preview.hidden = !media
  if (media) preview.src = URL.createObjectURL(media.blob)
  else preview.removeAttribute("src")
}

function setBusy(busy: boolean) {
  decideButton.disabled = busy
  stopButton.hidden = !busy
}

function truncateData(key: string, value: unknown) {
  return key === "data" && typeof value === "string" ? `<${value.length} base64 chars>` : value
}
