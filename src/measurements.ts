export type Point = { x: number; y: number; z: number };

const THUMB_TIP = 4;
const INDEX_TIP = 8;

export function pinchMidpoint(points: Point[]) {
  const thumb = points[THUMB_TIP];
  const index = points[INDEX_TIP];
  return { x: (thumb.x + index.x) / 2, y: (thumb.y + index.y) / 2 };
}

// distances are in image-width units, so the zone is a true circle on screen
export function nearestLandmark(target: { x: number; y: number }, points: Point[], aspectRatio: number) {
  return points
    .map((point, landmark) => ({
      landmark,
      distance: Math.hypot(point.x - target.x, (point.y - target.y) / aspectRatio),
    }))
    .reduce((nearest, candidate) => (candidate.distance < nearest.distance ? candidate : nearest));
}
