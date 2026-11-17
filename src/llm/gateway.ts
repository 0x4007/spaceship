const INFERENCE_URL = "/api/apps/spaceship/inference"
const SESSION_URL = "/api/account/session"
const DEADLINE_MS = 60000
const MAX_ACTIVE = 32
const MAX_BACKGROUND = 24
const MAX_PENDING = 256

export type CompletionRequest = { system: string; user: string; temperature: number; maxCompletionTokens: number; signal: AbortSignal }
export type Question =
  | { type: "score"; instructions: string; criteria: string[] }
  | { type: "noul"; instructions: string; criteria?: { true_description?: string; false_description?: string } }
export type Answer = { type: "score"; score: number } | { type: "noul"; noul: number }
export type DecisionRequest = { input: string; questions: Record<string, Question> }
export type InferenceFailure = Error & { code: string; retryable: boolean; retryAfterMs?: number }
type Priority = "story" | "background"
type WaitingRequest = { priority: Priority; signal: AbortSignal; start: (release: () => void) => void; reject: (error: unknown) => void; abort: () => void }

export const { streamCompletion, createDecisions, onInferenceError, resumeCapacity } = createInferenceClient()

export function createInferenceClient(transport: typeof fetch = fetch) {
  let csrfToken: string | undefined
  let blocked: InferenceFailure | undefined
  let onFailure: ((error: InferenceFailure) => void) | undefined
  let active = 0
  let background = 0
  const waiting: WaitingRequest[] = []
  const exhausted = new Map<string, InferenceFailure>()

  return {
    streamCompletion,
    createDecisions,
    resumeCapacity: () => exhausted.clear(),
    onInferenceError: (handler: (error: InferenceFailure) => void) => (onFailure = handler),
  }

  function acquire(priority: Priority, signal: AbortSignal): Promise<() => void> {
    signal.throwIfAborted()
    if (blocked) return Promise.reject(blocked)
    if (waiting.length >= MAX_PENDING && !(priority === "story" && active < MAX_ACTIVE)) {
      return Promise.reject(failure("busy", "Capacity is busy. Move the cursor to continue.", true))
    }
    return new Promise((start, reject) => {
      const job: WaitingRequest = {
        priority,
        signal,
        start,
        reject,
        abort: () => {
          const index = waiting.indexOf(job)
          if (index !== -1) waiting.splice(index, 1)
          signal.removeEventListener("abort", job.abort)
          reject(signal.reason)
        },
      }
      signal.addEventListener("abort", job.abort, { once: true })
      waiting.push(job)
      drain()
    })
  }

  function drain() {
    if (blocked) {
      for (const job of waiting.splice(0)) {
        job.signal.removeEventListener("abort", job.abort)
        job.reject(blocked)
      }
      return
    }
    while (active < MAX_ACTIVE) {
      const story = waiting.findIndex((job) => job.priority === "story")
      const index = story !== -1 ? story : background < MAX_BACKGROUND ? waiting.findIndex((job) => job.priority === "background") : -1
      if (index === -1) return
      const [job] = waiting.splice(index, 1)
      job.signal.removeEventListener("abort", job.abort)
      if (job.signal.aborted) {
        job.reject(job.signal.reason)
        continue
      }
      active++
      if (job.priority === "background") background++
      let released = false
      job.start(() => {
        if (released) return
        released = true
        active--
        if (job.priority === "background") background--
        drain()
      })
    }
  }

  async function sessionToken(signal: AbortSignal) {
    if (csrfToken) return csrfToken
    const response = await transport(SESSION_URL, { credentials: "same-origin", cache: "no-store", signal })
    if (!response.ok) throw httpFailure(response.status)
    const session: unknown = await response.json()
    if (!isRecord(session) || session.administrator !== true || typeof session.csrfToken !== "string" || !session.csrfToken) {
      throw failure("session", "Your administrator session is unavailable. Reload to sign in.")
    }
    return (csrfToken = session.csrfToken)
  }

  async function post(body: unknown, signal: AbortSignal) {
    signal.throwIfAborted()
    if (blocked) throw blocked
    const encoded = JSON.stringify(body)
    if (new TextEncoder().encode(encoded).length > 65536) throw failure("request_size", "This passage is too long. Reload to start a new story.")
    const previous = exhausted.get(encoded)
    if (previous) throw previous
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted()
      if (blocked) throw blocked
      const response = await transport(INFERENCE_URL, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json", "x-csrf-token": await sessionToken(signal) },
        body: encoded,
        signal,
      })
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) csrfToken = undefined
        let body: unknown
        try {
          body = await response.json()
        } catch {
          await response.body?.cancel().catch(() => {})
        }
        const error = httpFailure(response.status, body)
        if (isCapacityFailure(error)) {
          if (attempt < 3) {
            const seconds = Number(response.headers.get("retry-after"))
            await backoff(Math.max(100 * 2 ** attempt, Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 0), signal)
            continue
          }
          exhausted.set(encoded, error)
          if (exhausted.size > MAX_PENDING) exhausted.delete(exhausted.keys().next().value!)
        }
        throw error
      }
      return response
    }
  }

  function report(error: unknown, delivered = false): InferenceFailure {
    const cause = isFailure(error)
      ? error
      : error instanceof SyntaxError
        ? failure("protocol", "The inference response was invalid. Reload to retry.")
        : failure("connection", "Inference was interrupted. Reload to retry.")
    const result = delivered ? failure(cause.code, "Generation stopped after partial text. Reload to continue.") : cause
    if (!result.retryable) {
      blocked = result
      drain()
    }
    onFailure?.(result)
    return result
  }

  async function* streamCompletion({ signal: callerSignal, ...request }: CompletionRequest, priority: Priority = "background") {
    const signal = AbortSignal.any([callerSignal, AbortSignal.timeout(DEADLINE_MS)])
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    let delivered = false
    let release: (() => void) | undefined
    try {
      release = await acquire(priority, signal)
      const response = await post({ operation: "completion", ...request }, signal)
      if (!response.headers.get("content-type")?.startsWith("text/event-stream") || !response.body) {
        await response.body?.cancel()
        throw failure("protocol", "The inference response was invalid. Reload to retry.")
      }
      reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let data: string[] = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) throw failure("incomplete", "Generation ended before completion. Reload to retry.")
        buffer += decoder.decode(value, { stream: true })
        if (buffer.length > 262144) throw failure("protocol", "The inference response was invalid. Reload to retry.")
        while (buffer.includes("\n")) {
          const end = buffer.indexOf("\n")
          const line = buffer.slice(0, end).replace(/\r$/, "")
          buffer = buffer.slice(end + 1)
          if (line.startsWith("data:")) data.push(line.slice(5).trimStart())
          if (line !== "" || !data.length) continue
          let event: unknown
          try {
            event = JSON.parse(data.join("\n"))
          } catch {
            throw failure("protocol", "The inference response was invalid. Reload to retry.")
          }
          data = []
          if (!isRecord(event)) throw failure("protocol", "The inference response was invalid. Reload to retry.")
          if (event.type === "done") {
            if (!delivered) throw failure("empty", "The model returned no text. Reload to retry.")
            return
          }
          if (event.type === "error") throw failure(typeof event.code === "string" ? event.code : "upstream", "Inference could not finish. Reload to retry.")
          if (event.type !== "delta" || typeof event.text !== "string") throw failure("protocol", "The inference response was invalid. Reload to retry.")
          if (event.text) {
            delivered = true
            yield event.text
          }
        }
      }
    } catch (error) {
      if (callerSignal.aborted) throw error
      throw report(error, delivered)
    } finally {
      try {
        if (reader) {
          await reader.cancel().catch(() => {})
          reader.releaseLock()
        }
      } finally {
        release?.()
      }
    }
  }

  async function createDecisions(request: DecisionRequest, callerSignal: AbortSignal): Promise<{ answers: Record<string, Answer> }> {
    const signal = AbortSignal.any([callerSignal, AbortSignal.timeout(DEADLINE_MS)])
    let release: (() => void) | undefined
    try {
      release = await acquire("background", signal)
      const response = await post({ operation: "judgments", input: request.input, questions: request.questions }, signal)
      if (!response.headers.get("content-type")?.startsWith("application/json")) {
        await response.body?.cancel()
        throw failure("protocol", "The judgment response was invalid. Reload to retry.")
      }
      const result: unknown = await response.json()
      if (!isRecord(result) || !isRecord(result.answers)) throw failure("protocol", "The judgment response was invalid. Reload to retry.")
      const answers: Record<string, Answer> = {}
      const keys = Object.keys(request.questions)
      if (Object.keys(result.answers).length !== keys.length) throw failure("protocol", "The judgment response was incomplete. Reload to retry.")
      for (const key of keys) {
        const answer = result.answers[key]
        const question = request.questions[key]
        const field = question.type === "score" ? "score" : "noul"
        const maximum = question.type === "score" ? question.criteria.length - 1 : 1
        if (
          !isRecord(answer) ||
          answer.type !== question.type ||
          Object.keys(answer).length !== 2 ||
          typeof answer[field] !== "number" ||
          !Number.isFinite(answer[field]) ||
          answer[field] < 0 ||
          answer[field] > maximum
        )
          throw failure("protocol", "The judgment response was invalid. Reload to retry.")
        Object.defineProperty(answers, key, {
          value: question.type === "score" ? { type: "score", score: answer[field] } : { type: "noul", noul: answer[field] },
          enumerable: true,
        })
      }
      return { answers }
    } catch (error) {
      if (callerSignal.aborted) throw error
      throw report(error)
    } finally {
      release?.()
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function failure(code: string, message: string, retryable = false): InferenceFailure {
  return Object.assign(new Error(message), { name: "InferenceError", code, retryable })
}

function isFailure(value: unknown): value is InferenceFailure {
  return value instanceof Error && "retryable" in value && typeof value.retryable === "boolean"
}

function httpFailure(status: number, body?: unknown) {
  if (isRecord(body) && typeof body.error === "string" && typeof body.code === "string") {
    if (status === 429 && body.code === "busy") return failure("busy", "Capacity is busy. Move the cursor to continue.", true)
    const message = body.error.slice(0, 240).replace(/[\u0000-\u001f\u007f]/g, " ")
    return failure(body.code, `${message} ${status === 401 ? "Reload to sign in." : "Reload to retry."}`)
  }
  if (status === 401) return failure("session", "Your session expired. Reload to sign in.")
  if (status === 403) return failure("access", "Your session cannot run inference. Reload the app.")
  if (status === 400 || status === 413 || status === 415) return failure("request", "This request could not be accepted. Reload the app.")
  if (status === 429) return failure("unavailable", "Inference is unavailable. Reload to retry.")
  return failure("unavailable", "Inference is unavailable. Reload to retry.")
}

export function isCapacityFailure(value: unknown): value is InferenceFailure {
  return isFailure(value) && value.code === "busy" && value.retryable
}

function backoff(milliseconds: number, signal: AbortSignal) {
  signal.throwIfAborted()
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort)
      resolve()
    }, milliseconds)
    const abort = () => {
      clearTimeout(timer)
      signal.removeEventListener("abort", abort)
      reject(signal.reason)
    }
    signal.addEventListener("abort", abort, { once: true })
  })
}
