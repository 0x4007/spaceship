import { toFeatures, type Sample } from "./sample.ts"

const STORAGE_KEY = "handstorm.trainer.dataset.v2"

export type ClassName = "positive" | "negative"
type GestureSamples = Record<ClassName, Sample[]>

export function createDataset(onSaveError: (error: unknown) => void) {
  const gestures = new Map<string, GestureSamples>(Object.entries(load()))

  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(gestures)))
    } catch (error) {
      onSaveError(error)
    }
  }

  return {
    names: () => [...gestures.keys()],
    has: (gesture: string) => gestures.has(gesture),
    count: (gesture: string, className: ClassName) => gestures.get(gesture)?.[className].length ?? 0,

    add(gesture: string) {
      if (!gestures.has(gesture)) gestures.set(gesture, { positive: [], negative: [] })

      save()
    },

    remove(gesture: string) {
      gestures.delete(gesture)
      save()
    },

    append(gesture: string, className: ClassName, samples: Sample[]) {
      gestures.get(gesture)?.[className].push(...samples)
      save()
    },

    clear(gesture: string, className: ClassName) {
      const samples = gestures.get(gesture)

      if (samples) samples[className] = []

      save()
    },

    trainingSets: () =>
      [...gestures].map(([name, { positive, negative }]) => ({
        name,
        positive: positive.map(toFeatures),
        negative: negative.map(toFeatures),
      })),
  }
}

function load(): Record<string, GestureSamples> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")
  } catch {
    return {}
  }
}
