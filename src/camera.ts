const DEFAULT_STORAGE_KEY = "handstorm.cameraId";

export async function setupCamera(
  video: HTMLVideoElement,
  select: HTMLSelectElement,
  storageKey = DEFAULT_STORAGE_KEY,
) {
  let stream: MediaStream | undefined;

  await start(localStorage.getItem(storageKey));
  await listCameras();
  select.addEventListener("change", () => {
    localStorage.setItem(storageKey, select.value);
    start(select.value).catch((error) => select.dispatchEvent(new ErrorEvent("error", { error })));
  });

  async function start(deviceId: string | null) {
    stream?.getTracks().forEach((track) => track.stop());
    try {
      stream = await openStream(deviceId);
    } catch (error) {
      if (!deviceId) throw error;
      localStorage.removeItem(storageKey);
      stream = await openStream(null);
    }
    video.srcObject = stream;
    await video.play();
    selectActiveCamera();
  }

  async function listCameras() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device.kind === "videoinput");
    select.replaceChildren(
      ...cameras.map((camera, index) => new Option(camera.label || `camera ${index + 1}`, camera.deviceId)),
    );
    selectActiveCamera();
  }

  function selectActiveCamera() {
    const activeId = stream?.getVideoTracks()[0]?.getSettings().deviceId;
    if (activeId) select.value = activeId;
  }
}

function openStream(deviceId: string | null) {
  return navigator.mediaDevices.getUserMedia({
    video: deviceId ? { deviceId: { exact: deviceId } } : true,
  });
}
