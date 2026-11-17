import assert from "node:assert/strict"
import { test } from "node:test"
import { createInferenceClient } from "../src/llm/gateway.ts"
import { bindModeToggle, clearLegacyKeys } from "../src/text/live-mode.ts"

const request = (signal = new AbortController().signal) => ({ system: "Continue.", user: "The door", temperature: 0.9, maxCompletionTokens: 2000, signal })
const json = (body, status = 200) => Response.json(body, { status })
const session = () => json({ administrator: true, csrfToken: "session-csrf" })
const encode = new TextEncoder()
function events(chunks, cancel = () => {}) {
  return new Response(
    new ReadableStream({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(encode.encode(chunk)))
        controller.close()
      },
      cancel,
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  )
}
const frame = (event) => `data: ${JSON.stringify(event)}\n\n`

test("existing session CSRF and cookies authenticate normalized split SSE without provider fields", async () => {
  const calls = []
  const client = createInferenceClient(async (url, options) => {
    calls.push({ url, options })
    return url === "/api/account/session" ? session() : events(['data: {"type":"delta","text":" opened"}\r', '\n\r\ndata: {"type":"done"}\n\n'])
  })
  assert.deepEqual(await Array.fromAsync(client.streamCompletion(request())), [" opened"])
  assert.deepEqual(
    calls.map(({ url }) => url),
    ["/api/account/session", "/api/apps/spaceship/inference"],
  )
  const options = calls[1].options
  assert.equal(options.credentials, "same-origin")
  assert.equal(options.headers["x-csrf-token"], "session-csrf")
  assert.deepEqual(JSON.parse(options.body), { operation: "completion", system: "Continue.", user: "The door", temperature: 0.9, maxCompletionTokens: 2000 })
  assert.equal("Authorization" in options.headers, false)
})

test("early iterator return cancels the response body", async () => {
  let cancelled = false
  const client = createInferenceClient(async (url) =>
    url === "/api/account/session"
      ? session()
      : new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(encode.encode(frame({ type: "delta", text: " opened" })))
            },
            cancel() {
              cancelled = true
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        ),
  )
  const iterator = client.streamCompletion(request())
  assert.equal((await iterator.next()).value, " opened")
  await iterator.return()
  assert.equal(cancelled, true)
})

test("caller cancellation reaches fetch and is not reported as an inference failure", async () => {
  const abort = new AbortController()
  let receivedSignal
  let failures = 0
  const client = createInferenceClient(async (url, options) => {
    if (url === "/api/account/session") return session()
    receivedSignal = options.signal
    return new Response(
      new ReadableStream({
        start(controller) {
          options.signal.addEventListener("abort", () => controller.error(options.signal.reason), { once: true })
        },
      }),
      { headers: { "content-type": "text/event-stream" } },
    )
  })
  client.onInferenceError(() => failures++)
  const pending = client.streamCompletion(request(abort.signal)).next()
  await new Promise((resolve) => setImmediate(resolve))
  abort.abort()
  await assert.rejects(pending, { name: "AbortError" })
  assert.equal(receivedSignal.aborted, true)
  assert.equal(failures, 0)
})

test("incomplete or error streams fail permanently after semantic text and cannot retry", async () => {
  for (const ending of ["", frame({ type: "error", code: "upstream", message: "safe" })]) {
    let posts = 0
    const client = createInferenceClient(async (url) => {
      if (url === "/api/account/session") return session()
      posts++
      return events([frame({ type: "delta", text: " partial" }), ending])
    })
    let reported
    client.onInferenceError((error) => (reported = error))
    await assert.rejects(Array.fromAsync(client.streamCompletion(request())), /partial text/)
    assert.equal(reported.retryable, false)
    await assert.rejects(Array.fromAsync(client.streamCompletion(request())))
    assert.equal(posts, 1)
  }
})

test("malformed events, empty completion and wrong content types are failures", async () => {
  for (const response of [events(["data: nope\n\n"]), events([frame({ type: "done" })]), new Response("<html>gate</html>")]) {
    const client = createInferenceClient(async (url) => (url === "/api/account/session" ? session() : response))
    await assert.rejects(Array.fromAsync(client.streamCompletion(request())))
  }
})

test("expired sessions and rejected CSRF never automatically dispatch another POST", async () => {
  for (const status of [401, 403]) {
    let calls = 0
    const client = createInferenceClient(async (url) => {
      calls++
      return url === "/api/account/session" ? (status === 401 ? json({}, 401) : session()) : json({}, status)
    })
    await assert.rejects(Array.fromAsync(client.streamCompletion(request())), /session/)
    const previous = calls
    await assert.rejects(Array.fromAsync(client.streamCompletion(request())))
    assert.equal(calls, previous)
  }
})

test("invalid administrator session bodies stop before any inference POST", async () => {
  for (const body of [{ administrator: false, csrfToken: "token" }, { administrator: true }, { administrator: true, csrfToken: 7 }]) {
    const calls = []
    const client = createInferenceClient(async (url) => {
      calls.push(url)
      return json(body)
    })
    await assert.rejects(Array.fromAsync(client.streamCompletion(request())), /administrator session/)
    assert.deepEqual(calls, ["/api/account/session"])
  }
})

test("oversized UTF-8 requests fail locally before session or inference dispatch", async () => {
  let calls = 0
  const client = createInferenceClient(async () => {
    calls++
    return session()
  })
  await assert.rejects(Array.fromAsync(client.streamCompletion({ ...request(), user: "🙂".repeat(20000) })), /too long/)
  assert.equal(calls, 0)
})

test("safe HTTP error and code from the bridge are consumed without retrying configuration failures", async () => {
  let posts = 0
  const client = createInferenceClient(async (url) => {
    if (url === "/api/account/session") return session()
    posts++
    return json({ error: "Inference is not configured.", code: "inference_not_configured" }, 503)
  })
  await assert.rejects(Array.fromAsync(client.streamCompletion(request())), (error) => {
    assert.equal(error.code, "inference_not_configured")
    assert.match(error.message, /Inference is not configured/)
    assert.equal(error.retryable, false)
    return true
  })
  await assert.rejects(Array.fromAsync(client.streamCompletion(request())))
  assert.equal(posts, 1)
})

test("judgments return only bounded score and noul estimates for exact requested IDs", async () => {
  const questions = {
    k1: { type: "score", instructions: "Relevant?", criteria: ["none", "weak", "moderate", "strong"] },
    s1: { type: "noul", instructions: "Delivered?" },
  }
  const expected = { answers: { k1: { type: "score", score: 1.5 }, s1: { type: "noul", noul: 0.8 } } }
  const client = createInferenceClient(async (url, options) => {
    if (url === "/api/account/session") return session()
    assert.deepEqual(JSON.parse(options.body), { operation: "judgments", input: "Story", questions })
    return json(expected)
  })
  assert.deepEqual(await client.createDecisions({ input: "Story", questions }, request().signal), expected)
  for (const answers of [
    {},
    { k1: { type: "score", score: 4 }, s1: expected.answers.s1 },
    { k1: expected.answers.k1, s1: { type: "noul", noul: -1 } },
    { k1: { ...expected.answers.k1, confidence: 0.9 }, s1: expected.answers.s1 },
  ]) {
    const invalid = createInferenceClient(async (url) => (url === "/api/account/session" ? session() : json({ answers })))
    await assert.rejects(invalid.createDecisions({ input: "Story", questions }, request().signal))
  }
})

test("malformed judgment JSON is a permanent protocol failure", async () => {
  const client = createInferenceClient(async (url) =>
    url === "/api/account/session" ? session() : new Response("{", { headers: { "content-type": "application/json" } }),
  )
  await assert.rejects(
    client.createDecisions({ input: "Story", questions: { s1: { type: "noul", instructions: "Delivered?" } } }, request().signal),
    (error) => {
      assert.equal(error.code, "protocol")
      assert.equal(error.retryable, false)
      return true
    },
  )
})

test("legacy cleanup removes only named keys without reading values and mode toggle needs no login", () => {
  const removed = []
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      removeItem: (key) => removed.push(key),
      getItem: () => {
        throw new Error("Key values must not be read")
      },
    },
    configurable: true,
  })
  clearLegacyKeys()
  assert.deepEqual(removed, ["cerebras-api-key", "gemini-api-key"])
  let click
  let destination
  const label = {}
  const toggle = { setAttribute() {}, querySelector: () => label, addEventListener: (_, handler) => (click = handler) }
  globalThis.location = { href: "https://vps.pavlovcik.com/apps/spaceship/", assign: (url) => (destination = url) }
  bindModeToggle(toggle, true)
  click()
  assert.equal(destination.searchParams.get("live"), "false")
  bindModeToggle(toggle, false)
  click()
  assert.equal(destination.searchParams.has("live"), false)
  delete globalThis.localStorage
  delete globalThis.location
})
