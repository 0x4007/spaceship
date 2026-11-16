import { mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { chromium } from "playwright-core"
import { PLACEHOLDER_KEY, routeModelCalls } from "./capture/api-proxy.mjs"
import { createHand, linear } from "./capture/hand.mjs"
import { encodeGif, startRecording } from "./capture/recorder.mjs"

/**
 * Records README clips of the app in flight mode, one per idea: `node scripts/capture-clips.mjs [name…]` with the dev server running (`npm run dev -- --port 5280`).
 * Model calls go through `capture/api-proxy.mjs` with the keys from `.env`. GIFs are written to `extra/clips/`.
 */
const APP_URL = process.env.APP_URL ?? "http://localhost:5280/spaceship/?live=true"
const CHROMIUM = process.env.CHROMIUM ?? "/snap/bin/chromium"
const OUTPUT_DIR = resolve(import.meta.dirname, "../extra/clips")
const VIEWPORT = { width: 1280, height: 800 }
const SCALE = 2
const GIF_WIDTH = 960

const clips = {
  "focus-monitor": focusMonitor,
  "attention-lock": attentionLock,
  "future-steering": futureSteering,
  "realtime-regeneration": realtimeRegeneration,
}

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(clips)
mkdirSync(OUTPUT_DIR, { recursive: true })
const browser = await chromium.launch({ executablePath: CHROMIUM })
try {
  for (const name of names) await capture(name, clips[name])
} finally {
  await browser.close()
}

async function capture(name, choreography) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE })
  await routeModelCalls(context)
  await context.addInitScript((key) => {
    localStorage.setItem("cerebras-api-key", key)
    localStorage.setItem("gemini-api-key", key)
  }, PLACEHOLDER_KEY)
  const page = await context.newPage()
  page.on("pageerror", (error) => console.error(`${name}: ${error.message}`))
  await page.goto(APP_URL)
  await page.waitForFunction(() => document.fonts.status === "loaded")
  const app = appOf(page)
  const hand = createHand(page)
  await hand.moveTo({ x: VIEWPORT.width * 0.62, y: VIEWPORT.height * 0.7 }, { ms: 1 })
  await app.waitForBuffer()

  console.log(`${name}: setting up`)
  const { crop, act } = await choreography({ page, app, hand })
  console.log(`${name}: recording`)
  const region = crop()
  const recording = await startRecording(page, name, region, SCALE)
  const acting = await act().then(
    () => undefined,
    (error) => error,
  )
  const frames = await recording.stop()
  if (acting) throw acting
  console.log(`${name}: encoding ${frames.frames.length} frames`)
  encodeGif(frames, { output: resolve(OUTPUT_DIR, `${name}.gif`), width: Math.min(GIF_WIDTH, region.width * SCALE) })
  await context.close()
}

/** The rail lights the lines that lead to the sentence at the knob; hovering an attention box swings the rail to what connects to that phrase. */
async function focusMonitor({ app, hand }) {
  await app.scrubTo(15, 0.55, { ms: 1 })
  await app.waitForRail()
  await app.expandAttention()
  await hand.moveTo(app.textPoint(19, 1.1), { ms: 1 })
  return {
    crop: () => app.region({ lines: 18, rail: true }),
    async act() {
      await hand.pause(1400)
      const boxes = await app.keywordRects()
      for (const box of boxes.slice(0, 4)) {
        await hand.moveTo(center(box))
        await app.waitForRail()
        await hand.pause(1500)
      }
      await hand.moveTo(app.textPoint(19, 1.1))
      await app.waitForRail()
      await hand.pause(1800)
    },
  }
}

/** Expanding sprouts attention boxes around keywords, each wired to the knob; dragging a box moves its keyword, and a selection locks a new phrase. */
async function attentionLock({ app, hand }) {
  await app.scrubTo(13, 0.7, { ms: 1 })
  await hand.moveTo(app.textPoint(17, 1.1), { ms: 1 })
  return {
    crop: () => app.region({ lines: 18, rail: true }),
    async act() {
      await hand.pause(700)
      await hand.moveTo(await app.knobCenter())
      await hand.pause(300)
      await hand.doubleClick()
      await app.waitForBoxes()
      await hand.pause(1800)
      const [box] = await app.keywordRects()
      await hand.moveTo(center(box))
      await hand.pause(500)
      await hand.press()
      await hand.moveTo({ x: center(box).x + 90, y: center(box).y + (await app.lineHeight()) }, { ms: 1200 })
      await hand.release()
      await hand.pause(900)
      const start = app.textPoint(2, 0.02)
      await hand.moveTo({ x: start.x - 2, y: start.y })
      await hand.press()
      await hand.moveTo(app.textPoint(2, 0.4), { ms: 900 })
      await hand.release()
      await hand.pause(1600)
      await hand.moveTo(await app.knobCenter())
      await hand.press()
      await hand.moveTo(app.textPoint(16, 0.75), { ms: 2400, arc: 0.02 })
      await hand.release()
      await hand.moveTo(app.textPoint(18, 1.1))
      await hand.pause(1800)
    },
  }
}

/** Double click and hold opens the fan of dimensions; carrying the new knob through the gate picks one, its swing and reach set the value and strength, then the text fulfills it and the knob pins. */
async function futureSteering({ page, app, hand }) {
  await app.scrubTo(8, 0.6, { ms: 1 })
  await hand.moveTo(app.textPoint(10, 0.3), { ms: 1 })
  await app.waitForMenu()
  return {
    crop: () => app.region({ lines: 15, rail: true, below: 250 }),
    async act() {
      await hand.pause(600)
      const knob = await app.knobCenter()
      await hand.moveTo(knob)
      await hand.pause(250)
      await hand.click()
      await hand.pause(120)
      await hand.press()
      await hand.pause(700)
      const options = await app.menuOptions()
      const choice = options[Math.min(1, options.length - 1)]
      const direction = unit({ x: choice.x - knob.x, y: choice.y - knob.y })
      await hand.moveTo({ x: knob.x + direction.x * 60, y: knob.y + direction.y * 60 }, { ms: 700 })
      await hand.pause(500)
      await hand.moveTo({ x: knob.x + direction.x * 150, y: knob.y + direction.y * 150 }, { ms: 700 })
      await hand.pause(400)
      const swung = rotate(direction, 0.5)
      await hand.moveTo({ x: knob.x + swung.x * 170, y: knob.y + swung.y * 170 }, { ms: 1100, arc: 0.25 })
      await hand.pause(500)
      await hand.moveTo({ x: knob.x + swung.x * 210, y: knob.y + swung.y * 210 }, { ms: 600 })
      await hand.pause(500)
      await hand.release()
      await hand.pause(900)
      const main = await app.knobCenter()
      await hand.moveTo(main)
      await hand.press()
      for (let line = 9; line <= 14; line++) {
        await hand.moveTo(app.textPoint(line, 1.05), { ms: 520, ease: linear, arc: 0 })
        if (await page.evaluate(() => document.querySelector(".future[data-pinned]") !== null)) break
      }
      await hand.release()
      await hand.moveTo({ x: hand.at().x + 40, y: hand.at().y + 60 })
      await hand.pause(2400)
    },
  }
}

/** Scrubbing forward reveals the buffered future at once; dragging back and resting there discards it, and a new continuation streams in. */
async function realtimeRegeneration({ app, hand }) {
  await app.scrubTo(4, 0.5, { ms: 1 })
  await hand.moveTo(app.textPoint(6, 0.3), { ms: 1 })
  return {
    crop: () => app.region({ lines: 16, rail: false }),
    async act() {
      await hand.pause(500)
      await hand.moveTo(await app.knobCenter())
      await hand.press()
      await hand.moveTo(app.textPoint(14, 0.8), { ms: 1600, arc: 0.04 })
      await hand.pause(500)
      for (const [line, x] of [
        [7, 0.4],
        [11, 0.6],
      ]) {
        await hand.moveTo(app.textPoint(line, x), { ms: 900 })
        await hand.pause(900)
        await hand.moveTo(app.textPoint(14, 0.8), { ms: 1100 })
        await hand.pause(500)
      }
      await hand.moveTo(app.textPoint(6, 0.5), { ms: 900 })
      await hand.pause(900)
      await hand.moveTo(app.textPoint(15, 0.9), { ms: 1300 })
      await hand.release()
      await hand.moveTo({ x: hand.at().x + 40, y: hand.at().y + 50 })
      await hand.pause(1200)
    },
  }
}

/** Reads and drives the page's layout, so choreographies aim at lines, words and knobs rather than fixed pixels. */
function appOf(page) {
  let metrics

  return {
    lineHeight: async () => (await measure()).lineHeight,
    textPoint: (line, fraction) => ({ x: metrics.left + metrics.width * fraction, y: metrics.top + metrics.lineHeight * (line + 0.5) }),
    knobCenter: () => page.locator("#pointer").evaluate((knob) => ((r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 }))(knob.getBoundingClientRect())),
    async scrubTo(line, fraction, options) {
      await measure()
      const hand = createHand(page)
      await hand.moveTo(await this.knobCenter(), { ms: 1 })
      await hand.drag(this.textPoint(line, fraction), options)
      await page.waitForTimeout(400)
    },
    waitForBuffer: () => page.waitForFunction(() => /\+\d{2,}/.test(document.querySelector("#status")?.textContent ?? ""), null, { timeout: 30000 }),
    waitForRail: () => page.waitForTimeout(2200),
    async expandAttention() {
      const hand = createHand(page)
      await hand.moveTo(await this.knobCenter(), { ms: 1 })
      await hand.doubleClick()
      await this.waitForBoxes()
    },
    waitForBoxes: () =>
      page.waitForFunction(() => (CSS.highlights.get("attention-word")?.size ?? 0) >= 3, null, { timeout: 30000 }).then(() => page.waitForTimeout(1200)),
    waitForMenu: () => page.waitForTimeout(4000),
    keywordRects: () =>
      page.evaluate(() =>
        [...(CSS.highlights.get("attention-word") ?? [])].map((range) => range.getBoundingClientRect().toJSON()).sort((a, b) => a.y - b.y || a.x - b.x),
      ),
    menuOptions: () =>
      page.evaluate(() =>
        [...document.querySelectorAll("#future-hud text")]
          .filter((text) => /[a-z]{3}/.test(text.textContent ?? ""))
          .map((text) => ((r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2, label: text.textContent }))(text.getBoundingClientRect())),
      ),
    /** A frame around the rail (if `rail`) and the text column, `lines` tall, with `below` px under them. */
    region: ({ lines, rail, below = 24 }) => {
      const left = rail ? metrics.railLeft - 24 : metrics.left - 140
      const right = metrics.left + metrics.width + 140
      const top = Math.max(0, metrics.top - 28)
      return { x: Math.round(left), y: Math.round(top), width: Math.round(right - left), height: Math.round(metrics.lineHeight * lines + 28 + below) }
    },
  }

  async function measure() {
    metrics = await page.evaluate(() => {
      const text = document.querySelector("#text")
      const style = getComputedStyle(text)
      const { left, top, width } = text.getBoundingClientRect()
      return {
        left,
        width,
        top: top + parseFloat(style.paddingTop),
        lineHeight: parseFloat(style.lineHeight),
        railLeft: document.querySelector("#rail").getBoundingClientRect().left,
      }
    })
    return metrics
  }
}

function center({ x, y, width, height }) {
  return { x: x + width / 2, y: y + height / 2 }
}

function unit({ x, y }) {
  const length = Math.hypot(x, y) || 1
  return { x: x / length, y: y / length }
}

function rotate({ x, y }, radians) {
  return { x: x * Math.cos(radians) - y * Math.sin(radians), y: x * Math.sin(radians) + y * Math.cos(radians) }
}
