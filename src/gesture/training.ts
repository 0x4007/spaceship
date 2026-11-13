import { confidence, sigmoid } from "./inference.ts"

export const MIN_SAMPLES = 10
const VALIDATION_MIN_SAMPLES = 20
const VALIDATION_FRACTION = 0.2
const MIN_STD = 0.05
const EPOCHS = 400
const LEARNING_RATE = 0.05
const L2 = 0.01

export type TrainedGesture = ReturnType<typeof train>

export function train(name: string, { positive, negative }: { positive: number[][]; negative: number[][] }) {
  if (Math.min(positive.length, negative.length) < MIN_SAMPLES) {
    throw new Error(`"${name}" needs at least ${MIN_SAMPLES} positive and ${MIN_SAMPLES} negative samples`)
  }

  return {
    name,
    ...fitLogistic(positive, negative),
    samples: { positive: positive.length, negative: negative.length },
    validation: validateOnLatestSamples(positive, negative),
  }
}

function validateOnLatestSamples(positive: number[][], negative: number[][]) {
  if (Math.min(positive.length, negative.length) < VALIDATION_MIN_SAMPLES) return null

  const [positiveTrain, positiveTest] = splitOffLatest(positive)
  const [negativeTrain, negativeTest] = splitOffLatest(negative)
  const model = fitLogistic(positiveTrain, negativeTrain)
  const hits =
    positiveTest.filter((features) => confidence(model, features) >= 0.5).length + negativeTest.filter((features) => confidence(model, features) < 0.5).length
  const samples = positiveTest.length + negativeTest.length

  return { accuracy: hits / samples, samples }
}

function splitOffLatest(samples: number[][]) {
  const cut = Math.floor(samples.length * (1 - VALIDATION_FRACTION))

  return [samples.slice(0, cut), samples.slice(cut)]
}

function fitLogistic(positive: number[][], negative: number[][]) {
  const rows = [...positive, ...negative]
  const labels = [...positive.map(() => 1), ...negative.map(() => 0)]
  const classWeights = [rows.length / (2 * negative.length), rows.length / (2 * positive.length)]
  const mean = rows[0].map((_, column) => average(rows.map((row) => row[column])))
  const std = mean.map((center, column) => Math.max(MIN_STD, Math.sqrt(average(rows.map((row) => (row[column] - center) ** 2)))))
  const standardized = rows.map((row) => row.map((value, column) => (value - mean[column]) / std[column]))

  return { ...descendWithAdam(standardized, labels, classWeights), mean, std }
}

function descendWithAdam(inputs: number[][], labels: number[], classWeights: number[]) {
  const dimension = inputs[0].length
  const weights = new Array<number>(dimension).fill(0)
  const firstMoment = new Array<number>(dimension + 1).fill(0)
  const secondMoment = new Array<number>(dimension + 1).fill(0)
  let bias = 0

  for (let epoch = 1; epoch <= EPOCHS; epoch++) {
    const gradient = new Array<number>(dimension + 1).fill(0)

    inputs.forEach((input, row) => {
      const logit = input.reduce((sum, value, index) => sum + weights[index] * value, bias)
      const error = ((sigmoid(logit) - labels[row]) * classWeights[labels[row]]) / inputs.length

      input.forEach((value, index) => (gradient[index] += error * value))
      gradient[dimension] += error
    })

    gradient.forEach((rawGradient, index) => {
      const isWeight = index < dimension
      const regularized = rawGradient + (isWeight ? L2 * weights[index] : 0)

      firstMoment[index] = 0.9 * firstMoment[index] + 0.1 * regularized
      secondMoment[index] = 0.999 * secondMoment[index] + 0.001 * regularized ** 2

      const step = (LEARNING_RATE * (firstMoment[index] / (1 - 0.9 ** epoch))) / (Math.sqrt(secondMoment[index] / (1 - 0.999 ** epoch)) + 1e-8)

      if (isWeight) weights[index] -= step
      else bias -= step
    })
  }

  return { weights, bias }
}

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
