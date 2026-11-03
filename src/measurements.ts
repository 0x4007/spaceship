export type Point = { x: number; y: number; z: number };

const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const FINGERS = [
  { mcp: 5, tip: 8 },
  { mcp: 9, tip: 12 },
  { mcp: 13, tip: 16 },
  { mcp: 17, tip: 20 },
];
const PINCH_OPEN_RATIO = 1.2;
const FIST_RATIO = 1;
const FLAT_RATIO = 1.9;

export function measure(points: Point[]) {
  return { pinch: pinch(points), openness: openness(points) };
}

// 1 = thumb and index touching, 0 = apart by more than a palm length
function pinch(points: Point[]) {
  const ratio = distance(points[THUMB_TIP], points[INDEX_TIP]) / palmLength(points);
  return clamp01(1 - ratio / PINCH_OPEN_RATIO);
}

// 0 = fist, 1 = fingers fully extended
function openness(points: Point[]) {
  const wrist = points[WRIST];
  const ratios = FINGERS.map(({ mcp, tip }) => distance(points[tip], wrist) / distance(points[mcp], wrist));
  const mean = ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
  return clamp01((mean - FIST_RATIO) / (FLAT_RATIO - FIST_RATIO));
}

function palmLength(points: Point[]) {
  return distance(points[WRIST], points[9]);
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function pinchMidpoint(points: Point[]) {
  const thumb = points[THUMB_TIP];
  const index = points[INDEX_TIP];
  return { x: (thumb.x + index.x) / 2, y: (thumb.y + index.y) / 2 };
}

export function nearestLandmark(target: { x: number; y: number }, points: Point[]) {
  return points
    .map((point, landmark) => ({ landmark, distance: Math.hypot(point.x - target.x, point.y - target.y) }))
    .reduce((nearest, candidate) => (candidate.distance < nearest.distance ? candidate : nearest));
}
