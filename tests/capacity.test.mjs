import assert from "node:assert/strict"
import { test } from "node:test"
import { createInferenceClient } from "../src/llm/gateway.ts"
import { createTextStream } from "../src/text/text-stream.ts"

const tick = () => new Promise((resolve) => setImmediate(resolve))
const session = () => Response.json({ administrator: true, csrfToken: "csrf" })
const busy = (retryAfter = "0") =>
  Response.json({ code: "busy", error: "Too many inference requests are active." }, { status: 429, headers: { "retry-after": retryAfter } })
const completed = () =>
  new Response('data: {"type":"delta","text":"final continuation"}\n\ndata: {"type":"done"}\n\n', { headers: { "content-type": "text/event-stream" } })
const request = (signal = new AbortController().signal) => ({ system: "Continue", user: "Story", temperature: 0.9, maxCompletionTokens: 100, signal })

test("capacity retries respect Retry-After and recover without a permanent latch", { timeout: 3000 }, async () => {
  const times = []
  const client = createInferenceClient(async (url) => {
    if (url === "/api/account/session") return session()
    times.push(Date.now())
    return times.length === 1 ? busy("1") : completed()
  })
  assert.deepEqual(await Array.fromAsync(client.streamCompletion(request(), "story")), ["final continuation"])
  assert.equal(times.length, 2)
  assert(times[1] - times[0] >= 950)
})

test("exhausted logical operations cannot reset retry budgets on rendering updates but deliberate resume works", { timeout: 3000 }, async () => {
  let posts = 0
  let available = false
  const client = createInferenceClient(async (url) => {
    if (url === "/api/account/session") return session()
    posts++
    return available ? Response.json({ answers: { s1: { type: "noul", noul: 1 } } }) : busy()
  })
  const job = { input: "Story", questions: { s1: { type: "noul", instructions: "Delivered?" } } }
  for (let update = 0; update < 3; update++)
    await assert.rejects(client.createDecisions(job, request().signal), (error) => error.code === "busy" && error.retryable)
  assert.equal(posts, 4)
  available = true
  client.resumeCapacity()
  assert.equal((await client.createDecisions(job, request().signal)).answers.s1.noul, 1)
  assert.equal(posts, 5)
})

test("rapid forward-back-forward cancels old output and capacity backoff, then resumes without duplicated text", { timeout: 3000 }, async () => {
  let posts = 0
  let cancellations = 0
  const client = createInferenceClient(async (url, options) => {
    if (url === "/api/account/session") return session()
    posts++
    if (posts === 2 || posts === 3) return busy()
    if (posts > 3) return completed()
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"type":"delta","text":"discard this"}\n\n'))
          options.signal.addEventListener("abort", () => controller.error(options.signal.reason), { once: true })
        },
        cancel() {
          cancellations++
        },
      }),
      { headers: { "content-type": "text/event-stream" } },
    )
  })
  const stream = createTextStream({ complete: (prefix, _, signal) => client.streamCompletion({ ...request(signal), user: prefix }, "story") }, () => {})
  const first = stream.generate("buffer low", { leads: [], controls: [] })
  await stream.streaming()
  stream.truncate(0)
  assert.equal(await first, "aborted")
  const back = stream.generate("buffer low", { leads: [], controls: [] })
  await tick()
  const forward = stream.regenerate(0, "steering changed", { leads: [], controls: [] })
  assert.equal(await back, "aborted")
  assert.equal(await forward, "done")
  assert.equal(stream.text, "final continuation")
  assert.equal(posts, 4)
  assert.equal(stream.activity().isGenerating, false)
})

test("capacity-looking errors after semantic text and non-capacity429 remain terminal", async () => {
  for (const response of [
    new Response('data: {"type":"delta","text":"partial"}\n\ndata: {"type":"error","code":"busy","message":"busy"}\n\n', {
      headers: { "content-type": "text/event-stream" },
    }),
    Response.json({ code: "upstream_error", error: "Rejected." }, { status: 429 }),
  ]) {
    let posts = 0
    const client = createInferenceClient(async (url) => {
      if (url === "/api/account/session") return session()
      posts++
      return response
    })
    await assert.rejects(Array.fromAsync(client.streamCompletion(request())), (error) => !error.retryable)
    client.resumeCapacity()
    await assert.rejects(Array.fromAsync(client.streamCompletion(request())))
    assert.equal(posts, 1)
  }
})
