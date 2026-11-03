import type { Point } from "./measurements.ts";

const WRIST = 0;
const INDEX_MCP = 5;
const MIDDLE_MCP = 9;
const PINKY_MCP = 17;
const FINGER_CHAINS = [
  [1, 2, 3, 4],
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
];
const FINGERTIPS = FINGER_CHAINS.map((chain) => chain[3]);
const MIN_STD = 0.05;
const MIN_SAMPLES = 10;
const VALIDATION_MIN_SAMPLES = 20;
const VALIDATION_FRACTION = 0.2;
const EPOCHS = 400;
const LEARNING_RATE = 0.05;
const L2 = 0.01;

export type RawSample = { hand: string; landmarks: number[] };
export type FeatureSet = { positive: number[][]; negative: number[][] };
export type GestureParameters = {
  name: string;
  weights: number[];
  bias: number;
  mean: number[];
  std: number[];
  samples: { positive: number; negative: number };
  validation: { accuracy: number; samples: number } | null;
};
export type ModelFile = { version: 2; feature: string; inference: string; gestures: GestureParameters[] };

export function toPoints(landmarks: number[]): Point[] {
  return Array.from({ length: landmarks.length / 3 }, (_, index) => ({
    x: landmarks[index * 3],
    y: landmarks[index * 3 + 1],
    z: landmarks[index * 3 + 2],
  }));
}

export function flatten(points: Point[]) {
  return points.flatMap((point) => [point.x, point.y, point.z]);
}

export function extractFeatures(worldLandmarks: Point[], handedness: string): number[] {
  const points = alignToPalm(worldLandmarks, handedness);
  return [...points.flatMap((p) => [p.x, p.y, p.z]), ...fingertipDistances(points), ...fingerBends(points)];
}

export function train(name: string, features: FeatureSet): GestureParameters {
  const { positive, negative } = features;
  if (positive.length < MIN_SAMPLES || negative.length < MIN_SAMPLES) {
    throw new Error(`"${name}" needs at least ${MIN_SAMPLES} positive and ${MIN_SAMPLES} negative samples`);
  }
  const validation = validate(features);
  const model = fitLogistic(positive, negative);
  return {
    name,
    ...model,
    samples: { positive: positive.length, negative: negative.length },
    validation,
  };
}

export function createModelFile(gestures: GestureParameters[]): ModelFile {
  return {
    version: 2,
    feature:
      "Per hand: MediaPipe world landmarks 0..20, left hands mirrored (x negated), translated to the wrist and rotated into a palm frame (y = wrist to middle MCP, z = palm normal from index MCP and pinky MCP), divided by wrist-to-middle-MCP distance, flattened as [x, y, z] x 21 (63 numbers); then 10 pairwise fingertip distances (thumb, index, middle, ring, pinky; pairs in order 01 02 03 04 12 13 14 23 24 34) in the same units; then 10 finger bend cosines (for each finger chain, cosine between consecutive bone vectors at its two inner joints, fingers in order thumb to pinky). 83 numbers total, invariant to hand rotation and distance.",
    inference:
      "z_i = (x_i - mean_i) / std_i; confidence = 1 / (1 + exp(-(bias + sum_i weights_i * z_i)))",
    gestures,
  };
}

export function confidence(parameters: GestureParameters, features: number[]) {
  const { weights, bias, mean, std } = parameters;
  let logit = bias;
  for (let index = 0; index < weights.length; index++) {
    logit += (weights[index] * (features[index] - mean[index])) / std[index];
  }
  return sigmoid(logit);
}

function alignToPalm(worldLandmarks: Point[], handedness: string): Point[] {
  const mirror = handedness === "Left" ? -1 : 1;
  const wrist = worldLandmarks[WRIST];
  const relative = worldLandmarks.map((point) => ({
    x: mirror * (point.x - wrist.x),
    y: point.y - wrist.y,
    z: point.z - wrist.z,
  }));
  const up = normalize(relative[MIDDLE_MCP]);
  const rawNormal = cross(relative[INDEX_MCP], relative[PINKY_MCP]);
  const normal = normalize(subtract(rawNormal, scale(up, dot(rawNormal, up))));
  const side = cross(normal, up);
  const size = length(relative[MIDDLE_MCP]);
  return relative.map((point) => ({
    x: dot(point, side) / size,
    y: dot(point, up) / size,
    z: dot(point, normal) / size,
  }));
}

function fingertipDistances(points: Point[]) {
  const distances: number[] = [];
  for (let first = 0; first < FINGERTIPS.length; first++) {
    for (let second = first + 1; second < FINGERTIPS.length; second++) {
      distances.push(length(subtract(points[FINGERTIPS[first]], points[FINGERTIPS[second]])));
    }
  }
  return distances;
}

function fingerBends(points: Point[]) {
  return FINGER_CHAINS.flatMap(([a, b, c, d]) => {
    const bones = [subtract(points[b], points[a]), subtract(points[c], points[b]), subtract(points[d], points[c])];
    return [cosine(bones[0], bones[1]), cosine(bones[1], bones[2])];
  });
}

// train on the earlier samples and test on the latest ones, because neighbouring frames are near-duplicates
function validate({ positive, negative }: FeatureSet) {
  if (Math.min(positive.length, negative.length) < VALIDATION_MIN_SAMPLES) return null;
  const [positiveTrain, positiveTest] = splitTail(positive);
  const [negativeTrain, negativeTest] = splitTail(negative);
  const model = fitLogistic(positiveTrain, negativeTrain);
  const parameters = { name: "", ...model } as GestureParameters;
  const hits =
    positiveTest.filter((sample) => confidence(parameters, sample) >= 0.5).length +
    negativeTest.filter((sample) => confidence(parameters, sample) < 0.5).length;
  const samples = positiveTest.length + negativeTest.length;
  return { accuracy: hits / samples, samples };
}

function splitTail(samples: number[][]): [number[][], number[][]] {
  const cut = Math.floor(samples.length * (1 - VALIDATION_FRACTION));
  return [samples.slice(0, cut), samples.slice(cut)];
}

function fitLogistic(positive: number[][], negative: number[][]) {
  const rows = [...positive, ...negative];
  const labels = [...positive.map(() => 1), ...negative.map(() => 0)];
  const classWeights = [rows.length / (2 * negative.length), rows.length / (2 * positive.length)];
  const mean = columnMeans(rows);
  const std = columnStds(rows, mean);
  const inputs = rows.map((row) => row.map((value, index) => (value - mean[index]) / std[index]));
  const { weights, bias } = adam(inputs, labels, classWeights);
  return { weights, bias, mean, std };
}

function adam(inputs: number[][], labels: number[], classWeights: number[]) {
  const dimension = inputs[0].length;
  const weights = new Array<number>(dimension).fill(0);
  let bias = 0;
  const moment1 = new Array<number>(dimension + 1).fill(0);
  const moment2 = new Array<number>(dimension + 1).fill(0);

  for (let epoch = 1; epoch <= EPOCHS; epoch++) {
    const gradient = new Array<number>(dimension + 1).fill(0);
    inputs.forEach((input, row) => {
      let logit = bias;
      for (let index = 0; index < dimension; index++) logit += weights[index] * input[index];
      const error = (sigmoid(logit) - labels[row]) * classWeights[labels[row]] / inputs.length;
      for (let index = 0; index < dimension; index++) gradient[index] += error * input[index];
      gradient[dimension] += error;
    });
    for (let index = 0; index <= dimension; index++) {
      const regularized = gradient[index] + (index < dimension ? L2 * weights[index] : 0);
      moment1[index] = 0.9 * moment1[index] + 0.1 * regularized;
      moment2[index] = 0.999 * moment2[index] + 0.001 * regularized ** 2;
      const step =
        (LEARNING_RATE * (moment1[index] / (1 - 0.9 ** epoch))) /
        (Math.sqrt(moment2[index] / (1 - 0.999 ** epoch)) + 1e-8);
      if (index < dimension) weights[index] -= step;
      else bias -= step;
    }
  }
  return { weights, bias };
}

function columnMeans(rows: number[][]) {
  return rows[0].map((_, column) => rows.reduce((sum, row) => sum + row[column], 0) / rows.length);
}

function columnStds(rows: number[][], mean: number[]) {
  return mean.map((center, column) =>
    Math.max(MIN_STD, Math.sqrt(rows.reduce((sum, row) => sum + (row[column] - center) ** 2, 0) / rows.length)),
  );
}

function sigmoid(value: number) {
  return 1 / (1 + Math.exp(-value));
}

function subtract(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(a: Point, factor: number): Point {
  return { x: a.x * factor, y: a.y * factor, z: a.z * factor };
}

function dot(a: Point, b: Point) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Point, b: Point): Point {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function length(a: Point) {
  return Math.hypot(a.x, a.y, a.z);
}

function normalize(a: Point) {
  return scale(a, 1 / length(a));
}

function cosine(a: Point, b: Point) {
  return dot(a, b) / (length(a) * length(b));
}
