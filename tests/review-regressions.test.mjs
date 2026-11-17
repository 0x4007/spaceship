import assert from "node:assert/strict"
import { test } from "node:test"
import { createInferenceClient } from "../src/llm/gateway.ts"

const tick = () => new Promise((resolve) => setImmediate(resolve))
const session = () => Response.json({ administrator: true, csrfToken: "csrf" })
const decision = (input) => ({ input, questions: { s1: { type: "noul", instructions: "Delivered?" } } })
const completion = (signal) => ({ system: "Continue", user: "Story", temperature: 0.9, maxCompletionTokens: 100, signal })

test("background bursts reserve story capacity, remove cancelled waiters and release every slot", { timeout: 2000 }, async () => {
  const controllers = Array.from({ length: 27 }, () => new AbortController())
  const pending = new Map()
  const posted = []
  let active = 0
  let maximum = 0
  const client = createInferenceClient(async (url, options) => {
    if (url === "/api/account/session") return session()
    const body = JSON.parse(options.body)
    posted.push(body)
    active++
    maximum = Math.max(maximum, active)
    if (body.operation === "completion") {
      assert.equal("priority" in body, false)
      active--
      return new Response('data: {"type":"delta","text":" continued"}\n\ndata: {"type":"done"}\n\n', { headers: { "content-type": "text/event-stream" } })
    }
    return new Response(
      new ReadableStream({
        start(controller) {
          let settled = false
          const finish = (aborted = false) => {
            if (settled) return
            settled = true
            active--
            pending.delete(body.input)
            if (aborted) controller.error(options.signal.reason)
            else {
              controller.enqueue(new TextEncoder().encode('{"answers":{"s1":{"type":"noul","noul":0.8}}}'))
              controller.close()
            }
          }
          options.signal.addEventListener("abort", () => finish(true), { once: true })
          pending.set(body.input, finish)
        },
      }),
      { headers: { "content-type": "application/json" } },
    )
  })
  const jobs = controllers.map((controller, index) => client.createDecisions(decision(`b${index}`), controller.signal).catch((error) => error))
  try {
    await tick()
    assert.equal(active, 24, "background work must leave capacity for story generation")
    controllers[25].abort()
    const words = await Array.fromAsync(client.streamCompletion(completion(new AbortController().signal), "story"))
    assert.deepEqual(words, [" continued"])
    assert.equal(maximum, 25)
    for (let round = 0; round < 3; round++) {
      for (const finish of [...pending.values()]) finish()
      await tick()
    }
    await Promise.all(jobs)
    assert.equal(
      posted.some((body) => body.input === "b25"),
      false,
    )
    assert.equal(active, 0)
    const after = client.createDecisions(decision("after"), new AbortController().signal)
    await tick()
    pending.get("after")()
    await after
    assert.equal(active, 0)
  } finally {
    controllers.forEach((controller) => controller.abort())
    for (const finish of [...pending.values()]) finish()
    await Promise.all(jobs)
  }
})

test("502 invalid-response and upstream-auth codes block subsequent background retries", async () => {
  for (const code of ["invalid_response", "upstream_error"]) {
    let posts = 0
    const client = createInferenceClient(async (url) => {
      if (url === "/api/account/session") return session()
      posts++
      return Response.json({ error: "Inference could not finish.", code }, { status: 502 })
    })
    for (let update = 0; update < 3; update++) await assert.rejects(client.createDecisions(decision("Story"), new AbortController().signal))
    assert.equal(posts, 1, `${code} must not be retried on later realization updates`)
  }
})

test("background queue is bounded and aborted queued requests never dispatch", { timeout: 2000 }, async () => {
  let posts = 0
  const controllers = Array.from({ length: 285 }, () => new AbortController())
  const client = createInferenceClient(async (url, options) => {
    if (url === "/api/account/session") return session()
    posts++
    return new Response(
      new ReadableStream({
        start(controller) {
          options.signal.addEventListener("abort", () => controller.error(options.signal.reason), { once: true })
        },
      }),
      { headers: { "content-type": "application/json" } },
    )
  })
  const jobs = controllers.map((controller) => client.createDecisions(decision("Story"), controller.signal).catch((error) => error))
  await tick()
  assert.equal(posts, 24)
  controllers.forEach((controller) => controller.abort())
  const outcomes = await Promise.all(jobs)
  assert.equal(outcomes.filter((error) => error.code === "busy").length, 5)
  assert.equal(posts, 24)
})

test("a stream slot stays occupied until asynchronous body cancellation finishes", { timeout: 2000 }, async () => {
  let posts = 0
  let finishCancel
  const client = createInferenceClient(async (url) => {
    if (url === "/api/account/session") return session()
    const id = ++posts
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"type":"delta","text":"text"}\n\n'))
        },
        cancel() {
          if (id === 1) return new Promise((resolve) => (finishCancel = resolve))
        },
      }),
      { headers: { "content-type": "text/event-stream" } },
    )
  })
  const iterators = Array.from({ length: 25 }, () => client.streamCompletion(completion(new AbortController().signal)))
  try {
    await Promise.all(iterators.slice(0, 24).map((iterator) => iterator.next()))
    const queued = iterators[24].next()
    const closing = iterators[0].return()
    await tick()
    assert.equal(posts, 24)
    finishCancel()
    await closing
    await queued
    assert.equal(posts, 25)
  } finally {
    finishCancel?.()
    await Promise.all(iterators.map((iterator) => iterator.return()))
  }
})

test("accepted reserved judgment IDs survive enumeration and JSON serialization", async () => {
  const questions = JSON.parse('{"__proto__":{"type":"noul","instructions":"Delivered?"}}')
  const client = createInferenceClient(async (url) =>
    url === "/api/account/session" ? session() : Response.json(JSON.parse('{"answers":{"__proto__":{"type":"noul","noul":0.8}}}')),
  )
  const result = await client.createDecisions({ input: "Story", questions }, new AbortController().signal)
  assert.deepEqual(Object.keys(result.answers), ["__proto__"])
  assert.equal(Object.hasOwn(JSON.parse(JSON.stringify(result)).answers, "__proto__"), true)
})
