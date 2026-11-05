import type { Point, Tool } from "./tool.ts";

export const PULL_OUT_SPEED = 0.6;
const SPEED_SMOOTHING = 0.5;
const TITLE_TRAVEL_REACH = 0.1;

export const createToolSelection = () => {
  const pulled = new Map<string, Tool>();

  return {
    pulledTool: (hand: string) => pulled.get(hand),

    pullOut: (hand: string, tool: Tool) => pulled.set(hand, tool),

    keepOnly: (hands: string[]) =>
      pulled.forEach((tool, hand) => {
        if (hands.includes(hand)) return;

        tool.release?.();
        pulled.delete(hand);
      }),
  };
};

export const createPullSpeeds = () => {
  const last = new Map<string, { reach: number; at: number; speed: number }>();

  return {
    measure(hand: string, reach: number, now: number) {
      const previous = last.get(hand);
      const instant = previous ? ((reach - previous.reach) / Math.max(now - previous.at, 1)) * 1000 : 0;
      const speed = previous ? previous.speed + (instant - previous.speed) * SPEED_SMOOTHING : 0;

      last.set(hand, { reach, at: now, speed });

      return speed;
    },

    keepOnly: (hands: Set<string>) => last.forEach((_, hand) => hands.has(hand) || last.delete(hand)),
  };
};

export const titleProgress = (reach: number) => 1 - (1 - Math.min(reach / TITLE_TRAVEL_REACH, 1)) ** 3;

export const reachBetween = (a: Point, b: Point, aspectRatio: number) => Math.hypot(a.x - b.x, (a.y - b.y) / aspectRatio);
