export type LogEntry = { at: number; event: string; detail: string }

const listeners = new Set<(entry: LogEntry) => void>()

export const log = (event: string, detail = "") => {
  const entry = { at: performance.now(), event, detail }

  listeners.forEach((listener) => listener(entry))
}

export const onLog = (listener: (entry: LogEntry) => void) => listeners.add(listener)
