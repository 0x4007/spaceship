import type { ItemSlots } from "../chat/item-slots.ts"
import { pulledTextOf } from "../chat/items.ts"
import { fingerOfLandmark, type Finger } from "../fingers.ts"
import { ACTING_HAND } from "../hands.ts"
import { distanceBetween, type Point } from "../point.ts"
import { sounds } from "../sound/sounds.ts"
import { toolFor } from "../tools/index.ts"
import { createToolSelection } from "../tools/selection.ts"
import { textTool, type PlacedText, type PlacedTexts } from "../tools/text.ts"
import type { Tool } from "../tools/tool.ts"
import type { Overlay } from "../tracking/overlay.ts"
import { createMarquee, titleProgress } from "./marquee.ts"
import { PINCH_TARGET_RADIUS, type PinchTarget } from "./pinch.ts"
import { createPullSpeeds, PULL_OUT_SPEED } from "./pull-speed.ts"
import { createPullTicks } from "./pull-ticks.ts"
import { createRetractions } from "./retraction.ts"

type Strip = { text: string; tip: Point; midpoint: Point; title?: { length: number; progress: number }; finger?: Finger }
type ToolDraw = { underlay: boolean; draw: () => void }

type Dependencies = { video: HTMLVideoElement; overlay: Overlay; itemSlots: ItemSlots; placedTexts: PlacedTexts }

export function createPulls({ video, overlay, itemSlots, placedTexts }: Dependencies) {
  const toolSelection = createToolSelection()
  const pullSpeeds = createPullSpeeds()
  const pullTicks = createPullTicks()
  const marquee = createMarquee()
  const retractions = createRetractions()
  const lastStrips = new Map<string, Strip>()

  return { update, dropHeld: (hand: string, now: number) => toolSelection.dropTool(hand, now) }

  function update(targets: PinchTarget[], aspectRatio: number, now: number, showTargetArea: boolean) {
    const midpoints = new Map(targets.map(({ hand, midpoint }) => [hand, midpoint]))
    const stripped = new Set<string>()
    const hiddenTitles = new Set<Finger>()
    const toolDraws: ToolDraw[] = []

    toolSelection.keepOnly(targets.map(({ hand }) => hand))
    targets.forEach(handleTarget)
    marquee.keepOnly(stripped)
    pullSpeeds.keepOnly(stripped)
    pullTicks.keepOnly(stripped)
    drawTools()
    retractReleasedStrips()
    drawRetractions()

    return hiddenTitles

    function handleTarget({ hand, midpoint, direction, scale, tip, landmark }: PinchTarget) {
      overlay.drawPinchTarget(midpoint, PINCH_TARGET_RADIUS, showTargetArea)

      const finger = landmark === undefined ? undefined : fingerOfLandmark(landmark)
      const pulledTool = toolSelection.pulledTool(hand)

      if (pulledTool) return queueToolDraw(pulledTool, { position: midpoint, direction, scale })
      if (!tip || !finger) return

      const pullsItem = hand === ACTING_HAND
      const item = pullsItem ? itemSlots.itemAt(finger) : undefined
      const definition = toolFor(finger)
      const text = pullsItem ? item && pulledTextOf(item) : definition.name

      if (!text) return

      const reach = distanceBetween(tip, midpoint, aspectRatio)

      if (pullSpeeds.measure(hand, reach, now) >= PULL_OUT_SPEED) {
        sounds.pulledOut()
        toolSelection.pullOut(hand, pullsItem ? textTool(text, placeText, placedTexts.drop) : definition.create())
        if (pullsItem) itemSlots.take(finger)
        lastStrips.delete(hand)
        retractions.start({ text, origin: tip, anchor: midpoint, followHand: hand }, now)
        return
      }

      pullTicks.measure(hand, reach)

      const title = item && { length: item.title.length, progress: titleProgress(reach) }
      const scroll = marquee.scroll(hand, !title || title.progress >= 1, now)

      stripped.add(hand)
      if (pullsItem) hiddenTitles.add(finger)
      lastStrips.set(hand, { text, tip, midpoint, title, finger: pullsItem ? finger : undefined })
      overlay.drawTether(tip, midpoint)
      overlay.drawStrip(text, tip, midpoint, { title: title && { ...title, rest: tip }, scroll: pullsItem ? scroll : 0 })
    }

    function placeText(item: PlacedText) {
      sounds.drop()
      placedTexts.add(item)
    }

    function queueToolDraw(tool: Tool, pose: { position: Point; direction: Point; scale: number }) {
      toolDraws.push({
        underlay: !!tool.underlay,
        draw: () => tool.draw({ ...pose, video, surface: overlay.surface }),
      })
    }

    function drawTools() {
      toolDraws.sort((a, b) => Number(b.underlay) - Number(a.underlay)).forEach(({ draw }) => draw())
    }

    function retractReleasedStrips() {
      lastStrips.forEach(({ text, tip, midpoint, title, finger }, hand) => {
        if (stripped.has(hand)) return

        retractions.start({ text, origin: midpoint, anchor: tip, title, finger }, now)
        lastStrips.delete(hand)
      })
    }

    function drawRetractions() {
      retractions.segments(now, midpoints).forEach(({ text, anchor, end, title, finger }) => {
        if (finger) hiddenTitles.add(finger)
        overlay.drawTether(end, anchor)
        overlay.drawStrip(text, end, anchor, { title: title && { ...title, rest: anchor } })
      })
    }
  }
}
