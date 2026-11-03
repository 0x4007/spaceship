const STORAGE_KEY = "handstorm.cameraId"

export async function setupCamera(
  video: HTMLVideoElement,
  select: HTMLSelectElement,
  onError: (error: unknown) => void,
) {
  let stream: MediaStream | undefined

  const selectActiveCamera = () => {
    const activeId = stream?.getVideoTracks()[0]?.getSettings().deviceId

    if (activeId) select.value = activeId
  }

  const start = async (deviceId: string | null) => {
    stream?.getTracks().forEach((track) => track.stop())

    try {
      stream = await openStream(deviceId)
    } catch (error) {
      if (!deviceId) throw error

      localStorage.removeItem(STORAGE_KEY)
      stream = await openStream(null)
    }

    video.srcObject = stream
    await video.play()
    selectActiveCamera()
  }

  const listCameras = async () => {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const cameras = devices.filter(({ kind }) => kind === "videoinput")

    select.replaceChildren(...cameras.map(({ label, deviceId }, index) => new Option(label || `camera ${index + 1}`, deviceId)))
    selectActiveCamera()
  }

  await start(localStorage.getItem(STORAGE_KEY))
  await listCameras()

  select.addEventListener("change", () => {
    localStorage.setItem(STORAGE_KEY, select.value)
    start(select.value).catch(onError)
  })
}

const openStream = (deviceId: string | null) =>
  navigator.mediaDevices.getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId } } : true })
