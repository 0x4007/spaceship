export type CapturedMedia = { blob: Blob; mimeType: string }

export async function grantMediaAccess() {
  const results = await Promise.allSettled([navigator.mediaDevices.getUserMedia({ audio: true }), navigator.mediaDevices.getUserMedia({ video: true })])
  for (const result of results) if (result.status === "fulfilled") result.value.getTracks().forEach((track) => track.stop())
  const denied = results.find((result) => result.status === "rejected")
  if (denied) throw denied.reason
}

export async function fillDeviceSelect(select: HTMLSelectElement, kind: MediaDeviceKind) {
  const previous = select.value
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === kind && device.deviceId)

  select.replaceChildren(...devices.map((device, index) => new Option(device.label || `${kind} ${index + 1}`, device.deviceId)))
  if (devices.some((device) => device.deviceId === previous)) select.value = previous
}

export function createCamera(video: HTMLVideoElement) {
  let stream: MediaStream | undefined

  async function start(deviceId: string) {
    stop()
    stream = await navigator.mediaDevices.getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId } } : true })
    video.srcObject = stream
    await video.play()
  }

  function stop() {
    stream?.getTracks().forEach((track) => track.stop())
    stream = undefined
    video.srcObject = null
  }

  async function capture(): Promise<CapturedMedia> {
    if (!stream) throw new Error("start the camera first")
    const canvas = Object.assign(document.createElement("canvas"), { width: video.videoWidth, height: video.videoHeight })
    canvas.getContext("2d")!.drawImage(video, 0, 0)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9))
    if (!blob) throw new Error("snapshot failed")
    return { blob, mimeType: "image/jpeg" }
  }

  return { start, stop, capture, isOn: () => !!stream }
}

export type LiveCapture = { stream: MediaStream; release: () => void }

export async function openMic(deviceId: string): Promise<LiveCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : true })
  return { stream, release: () => stopTracks(stream) }
}

export async function openScreen(withDefaultMic: boolean): Promise<LiveCapture> {
  const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
  const mic = withDefaultMic ? await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => undefined) : undefined
  const sources = [display, mic].filter((stream) => stream?.getAudioTracks().length) as MediaStream[]
  const releaseSources = () => [display, mic].forEach((stream) => stream && stopTracks(stream))

  if (sources.length < 2)
    return { stream: new MediaStream([...display.getVideoTracks(), ...sources.flatMap((stream) => stream.getAudioTracks())]), release: releaseSources }

  const context = new AudioContext()
  const mix = context.createMediaStreamDestination()
  sources.forEach((stream) => context.createMediaStreamSource(stream).connect(mix))
  return {
    stream: new MediaStream([...display.getVideoTracks(), ...mix.stream.getAudioTracks()]),
    release: () => {
      releaseSources()
      context.close()
    },
  }
}

export const VIDEO_MIME_TYPE = ["video/mp4", "video/webm"].find((type) => MediaRecorder.isTypeSupported(type))

export function createRecorder(onRecorded: (media: CapturedMedia) => void) {
  let recorder: MediaRecorder | undefined

  function start({ stream, release }: LiveCapture, mimeType?: string) {
    const chunks: Blob[] = []
    const active = new MediaRecorder(stream, { mimeType })
    recorder = active

    active.addEventListener("dataavailable", (event) => chunks.push(event.data))
    active.addEventListener("stop", () => {
      release()
      recorder = undefined
      const type = baseMimeType(active.mimeType)
      onRecorded({ blob: new Blob(chunks, { type }), mimeType: type })
    })
    stream.getTracks().forEach((track) => track.addEventListener("ended", stop))
    active.start()
  }

  function stop() {
    if (recorder?.state === "recording") recorder.stop()
  }

  return { start, stop, isRecording: () => !!recorder }
}

export async function toBase64(blob: Blob) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
  return dataUrl.slice(dataUrl.indexOf(",") + 1)
}

const stopTracks = (stream: MediaStream) => stream.getTracks().forEach((track) => track.stop())

const baseMimeType = (mimeType: string) => mimeType.split(";")[0].trim()
