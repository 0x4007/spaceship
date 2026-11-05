class PcmProcessor extends AudioWorkletProcessor {
  buffer = new Int16Array(4096)
  offset = 0

  process(inputs: Float32Array[][]) {
    for (const sample of inputs[0]?.[0] ?? []) {
      const clamped = Math.max(-1, Math.min(1, sample))

      this.buffer[this.offset++] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff

      if (this.offset === this.buffer.length) {
        this.port.postMessage(new Uint8Array(this.buffer.buffer.slice(0)))
        this.offset = 0
      }
    }
    return true
  }
}

registerProcessor("pcm-processor", PcmProcessor)
