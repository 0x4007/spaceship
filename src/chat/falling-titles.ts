import type { Point } from "../point.ts"

type Falling = { title: string; origin: Point; startedAt: number }

const GRAVITY = 3
const OFF_SCREEN_Y = 1.1

export function createFallingTitles() {
  let falling: Falling[] = []

  return {
    drop(titles: { title: string; origin: Point }[], now: number) {
      falling.push(...titles.map((title) => ({ ...title, startedAt: now })))
    },

    positions(now: number) {
      const positions = falling.map(({ title, origin, startedAt }) => ({
        title,
        point: {
          x: origin.x,
          y: origin.y + 0.5 * GRAVITY * ((now - startedAt) / 1000) ** 2,
        },
      }))

      falling = falling.filter((_, index) => positions[index].point.y < OFF_SCREEN_Y)

      return positions.filter(({ point }) => point.y < OFF_SCREEN_Y)
    },
  }
}
