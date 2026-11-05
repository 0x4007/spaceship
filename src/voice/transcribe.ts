import pcmProcessorUrl from "./pcm-processor.ts?worker&url"

const SAMPLE_RATE = 16000
const API_HOST = "api.elevenlabs.io"
export const API_KEY_STORAGE = "el_key"
const LANGUAGE_STORAGE = "el_lang"

const VAD_PARAMS = {
  vad_silence_threshold_secs: "0.3",
  vad_threshold: "0.4",
  min_speech_duration_ms: "100",
  min_silence_duration_ms: "100",
}

export async function transcribeUntilCommit(signal: AbortSignal, onPartial?: (text: string) => void): Promise<string> {
  const apiKey = localStorage.getItem(API_KEY_STORAGE)?.trim()
  if (!apiKey) throw new Error(`ElevenLabs API key missing: set localStorage "${API_KEY_STORAGE}"`)

  const cleanups: (() => void | Promise<void>)[] = []
  const aborted = () => new DOMException("Transcription aborted", "AbortError")
  const throwIfAborted = () => {
    if (signal.aborted) throw aborted()
  }

  try {
    const token = await fetchToken(apiKey)
    throwIfAborted()

    const socket = new WebSocket(`wss://${API_HOST}/v1/speech-to-text/realtime?${socketParams(token)}`)
    cleanups.push(() => socket.close())

    const committed = waitForCommit(socket, signal, onPartial)
    await Promise.race([opened(socket), committed])

    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    cleanups.push(() => micStream.getTracks().forEach((track) => track.stop()))
    throwIfAborted()

    const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE })
    cleanups.push(() => audioContext.close())
    await audioContext.audioWorklet.addModule(pcmProcessorUrl)
    throwIfAborted()

    const source = audioContext.createMediaStreamSource(micStream)
    const worklet = new AudioWorkletNode(audioContext, "pcm-processor")

    worklet.port.onmessage = ({ data }: MessageEvent<Uint8Array>) => {
      if (socket.readyState !== WebSocket.OPEN) return
      socket.send(
        JSON.stringify({
          message_type: "input_audio_chunk",
          audio_base_64: toBase64(data),
          commit: false,
          sample_rate: SAMPLE_RATE,
        }),
      )
    }
    source.connect(worklet)

    return await committed
  } finally {
    await Promise.allSettled(cleanups.reverse().map((cleanup) => cleanup()))
  }
}

async function fetchToken(apiKey: string): Promise<string> {
  const response = await fetch(`https://${API_HOST}/v1/single-use-token/realtime_scribe`, {
    method: "POST",
    headers: { "xi-api-key": apiKey },
  })
  if (!response.ok) throw new Error(`Token HTTP ${response.status}: ${await response.text()}`)

  return (await response.json()).token
}

function socketParams(token: string) {
  const params = new URLSearchParams({
    model_id: "scribe_v2_realtime",
    audio_format: `pcm_${SAMPLE_RATE}`,
    commit_strategy: "vad",
    token,
    ...VAD_PARAMS,
  })
  const language = localStorage.getItem(LANGUAGE_STORAGE)?.trim()
  if (language) params.set("language_code", language)

  return params
}

const opened = (socket: WebSocket) =>
  new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true })
    socket.addEventListener("error", () => reject(new Error("WebSocket error")), { once: true })
  })

const waitForCommit = (socket: WebSocket, signal: AbortSignal, onPartial?: (text: string) => void) =>
  new Promise<string>((resolve, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("Transcription aborted", "AbortError")), { once: true })
    socket.addEventListener("error", () => reject(new Error("WebSocket error")))
    socket.addEventListener("close", ({ code }) => reject(new Error(`WebSocket closed (${code})`)))
    socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data)

      if (message.message_type === "partial_transcript") onPartial?.(message.text ?? "")
      else if (message.message_type === "committed_transcript" && message.text?.trim()) resolve(message.text.trim())
      else if (message.error || message.message_type?.endsWith("_error")) reject(new Error(message.error ?? JSON.stringify(message)))
    })
  })

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
