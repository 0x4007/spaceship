import assert from "node:assert/strict"
import { test } from "node:test"

test("twenty-one relevance leads are batched without losing their original indices and cancellation stops later batches", async () => {
  const originalFetch = globalThis.fetch
  const batches = []
  globalThis.fetch = async (url, options) => {
    if (url === "/api/account/session") return Response.json({ administrator: true, csrfToken: "csrf" })
    const body = JSON.parse(options.body)
    const keys = Object.keys(body.questions)
    batches.push(keys)
    if (keys.length > 20) return Response.json({ error: "Invalid inference request.", code: "invalid_request" }, { status: 400 })
    return Response.json({ answers: Object.fromEntries(keys.map((key) => [key, { type: "score", score: Number(key.slice(1)) === 21 ? 3 : 0 }])) })
  }
  try {
    const { liveRelevance } = await import("../src/text/live-relevance.ts")
    const leads = Array.from({ length: 21 }, (_, index) => ({ before: "", keyword: `word${index}`, after: "" }))
    const result = await Array.fromAsync(liveRelevance({ story: "", tip: "Story.", leads }, new AbortController().signal))
    assert.deepEqual(
      batches.map((batch) => batch.length),
      [20, 1],
    )
    assert.deepEqual(
      result.map(({ index }) => index),
      Array.from({ length: 21 }, (_, index) => index),
    )
    assert.equal(result[20].relevance, 1)
    batches.length = 0
    const abort = new AbortController()
    const iterator = liveRelevance({ story: "", tip: "Story.", leads }, abort.signal)
    await iterator.next()
    abort.abort()
    await assert.rejects(Array.fromAsync(iterator), { name: "AbortError" })
    assert.deepEqual(
      batches.map((batch) => batch.length),
      [20],
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})
