import type { Point } from "./measurements.ts";

const MIN_CUTOFF = 2;
const BETA = 4;
const DERIVATIVE_CUTOFF = 1;

export function createHandFilter() {
  const filters = new Map<string, ReturnType<typeof createOneEuroFilter>>();

  return (hands: Point[][], labels: string[], seconds: number) => {
    const present = new Set(labels);
    for (const key of filters.keys()) {
      if (!present.has(key.split(":")[0])) filters.delete(key);
    }
    return hands.map((points, handIndex) =>
      points.map((point, index) => ({
        x: filterAxis(`${labels[handIndex]}:${index}:x`, point.x, seconds),
        y: filterAxis(`${labels[handIndex]}:${index}:y`, point.y, seconds),
        z: filterAxis(`${labels[handIndex]}:${index}:z`, point.z, seconds),
      })),
    );
  };

  function filterAxis(key: string, value: number, seconds: number) {
    if (!filters.has(key)) filters.set(key, createOneEuroFilter());
    return filters.get(key)!(value, seconds);
  }
}

function createOneEuroFilter() {
  let previous: { seconds: number; value: number; derivative: number } | undefined;

  return (value: number, seconds: number) => {
    if (!previous || seconds <= previous.seconds) {
      previous = { seconds, value, derivative: 0 };
      return value;
    }
    const delta = seconds - previous.seconds;
    const rawDerivative = (value - previous.value) / delta;
    const derivative = lowPass(rawDerivative, previous.derivative, smoothing(delta, DERIVATIVE_CUTOFF));
    const cutoff = MIN_CUTOFF + BETA * Math.abs(derivative);
    const filtered = lowPass(value, previous.value, smoothing(delta, cutoff));
    previous = { seconds, value: filtered, derivative };
    return filtered;
  };
}

function smoothing(delta: number, cutoff: number) {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / delta);
}

function lowPass(value: number, previous: number, alpha: number) {
  return alpha * value + (1 - alpha) * previous;
}
