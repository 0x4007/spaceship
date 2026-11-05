const MASTER_VOLUME = 0.6
const REVERB_SEND = 0.25
const REVERB_SECONDS = 1.4
const REVERB_FALLOFF = 3
const MAX_VOICES = 24
const SILENCE = 0.0001
const RELEASE_PADDING = 0.05
const UNLOCK_EVENTS = ["pointerdown", "keydown", "touchstart"]

type Graph = { context: AudioContext; bus: GainNode; noise: AudioBuffer }
type Envelope = { start?: number; duration?: number; volume?: number; attack?: number }

export type ToneOptions = Envelope & { frequency: number; glideTo?: number; type?: OscillatorType }
export type BurstOptions = Envelope & { type: BiquadFilterType; frequency: number; glideTo?: number; q?: number }

let graph: Graph | undefined
let activeVoices = 0

UNLOCK_EVENTS.forEach((event) => addEventListener(event, unlock, { once: true, passive: true }))

export function tone({ frequency, glideTo, type = "sine", ...envelope }: ToneOptions) {
  const voice = openVoice(envelope)
  if (!voice) return

  const { context, at, end, output } = voice
  const oscillator = context.createOscillator()

  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, at)
  if (glideTo) oscillator.frequency.exponentialRampToValueAtTime(glideTo, end)

  oscillator.connect(output)
  oscillator.start(at)
  retire(oscillator, end, output)
}

export function burst({ type, frequency, glideTo, q = 1, ...envelope }: BurstOptions) {
  const voice = openVoice(envelope)
  if (!voice) return

  const { context, at, end, output, noise } = voice
  const source = context.createBufferSource()
  const filter = context.createBiquadFilter()

  source.buffer = noise
  source.loop = true
  filter.type = type
  filter.Q.value = q
  filter.frequency.setValueAtTime(frequency, at)
  if (glideTo) filter.frequency.exponentialRampToValueAtTime(glideTo, end)

  source.connect(filter).connect(output)
  source.start(at, Math.random() * noise.duration)
  retire(source, end, output)
}

function unlock() {
  graph ??= createGraph()
  graph?.context.resume()
}

function openVoice({ start = 0, duration = 0.3, volume = 0.25, attack = 0.005 }: Envelope) {
  if (!graph || graph.context.state !== "running" || activeVoices >= MAX_VOICES) return

  const { context, bus, noise } = graph
  const at = context.currentTime + start
  const end = at + duration
  const output = context.createGain()

  output.gain.setValueAtTime(SILENCE, at)
  output.gain.linearRampToValueAtTime(volume, at + attack)
  output.gain.exponentialRampToValueAtTime(SILENCE, end)
  output.connect(bus)

  return { context, noise, at, end, output }
}

function retire(source: AudioScheduledSourceNode, end: number, output: GainNode) {
  activeVoices++
  source.onended = () => {
    activeVoices--
    source.disconnect()
    output.disconnect()
  }
  source.stop(end + RELEASE_PADDING)
}

function createGraph() {
  if (typeof AudioContext === "undefined") return

  const context = new AudioContext({ latencyHint: "interactive" })
  const master = context.createGain()
  const limiter = context.createDynamicsCompressor()
  const bus = context.createGain()
  const reverb = context.createConvolver()
  const reverbSend = context.createGain()

  master.gain.value = MASTER_VOLUME
  reverbSend.gain.value = REVERB_SEND
  reverb.buffer = impulseResponse(context)

  bus.connect(master)
  bus.connect(reverbSend).connect(reverb).connect(master)
  master.connect(limiter).connect(context.destination)

  return { context, bus, noise: noiseBuffer(context) }
}

function noiseBuffer(context: AudioContext) {
  const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate)

  buffer.getChannelData(0).forEach((_, index, samples) => (samples[index] = Math.random() * 2 - 1))

  return buffer
}

function impulseResponse(context: AudioContext) {
  const length = Math.floor(context.sampleRate * REVERB_SECONDS)
  const buffer = context.createBuffer(2, length, context.sampleRate)

  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    buffer.getChannelData(channel).forEach((_, index, samples) => {
      samples[index] = (Math.random() * 2 - 1) * (1 - index / length) ** REVERB_FALLOFF
    })
  }

  return buffer
}
