import { burst, tone } from "./engine.ts"
import { pitch } from "./scale.ts"

const TICK_BASE_DEGREE = 8
const TICK_MAX_STEPS = 12

export const sounds = {
  listen: () => tone({ frequency: pitch(6), glideTo: pitch(9), duration: 0.14, volume: 0.35 }),

  results: () =>
    [5, 7, 8, 10].forEach((degree, index) => tone({ frequency: pitch(degree), start: index * 0.07, duration: 0.35, type: "triangle", volume: 0.2 })),

  tick: (step: number) => tone({ frequency: pitch(TICK_BASE_DEGREE + Math.min(step, TICK_MAX_STEPS)), duration: 0.07, volume: 0.15, attack: 0.002 }),

  pulledOut: () => {
    tone({ frequency: pitch(7), glideTo: pitch(10), duration: 0.09, volume: 0.3 })
    tone({ frequency: pitch(10), glideTo: pitch(14), start: 0.07, duration: 0.11, volume: 0.3 })
  },

  drop: () => {
    tone({ frequency: 200, glideTo: 90, duration: 0.18, volume: 0.5 })
    burst({ type: "lowpass", frequency: 400, duration: 0.05, volume: 0.3 })
  },

  link: () => {
    tone({ frequency: pitch(5), glideTo: pitch(10), duration: 0.1, volume: 0.3 })
    tone({ frequency: pitch(10), glideTo: pitch(9), start: 0.1, duration: 0.12, volume: 0.25 })
  },

  shakeOff: () => {
    burst({ type: "bandpass", frequency: 2500, glideTo: 900, q: 1, duration: 0.12, volume: 0.12, attack: 0.03 })
    burst({ type: "bandpass", frequency: 900, glideTo: 2500, q: 1, start: 0.1, duration: 0.12, volume: 0.1, attack: 0.03 })
  },

  cleared: () =>
    [10, 12, 13, 15, 17].forEach((degree, index, degrees) =>
      glint({ degree, start: index * 0.045, duration: index === degrees.length - 1 ? 0.6 : 0.25, volume: 0.15 }),
    ),
}

function glint({ degree, start, duration, volume }: { degree: number; start: number; duration: number; volume: number }) {
  tone({ frequency: pitch(degree), start, duration, volume, attack: 0.002 })
  tone({ frequency: pitch(degree) * 2, start, duration: duration * 0.5, volume: volume * 0.35, attack: 0.002 })
}
