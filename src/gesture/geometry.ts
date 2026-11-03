export type Point = { x: number; y: number; z: number }

export const subtract = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })

export const scale = (a: Point, factor: number) => ({ x: a.x * factor, y: a.y * factor, z: a.z * factor })

export const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y + a.z * b.z

export const cross = (a: Point, b: Point) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})

export const length = (a: Point) => Math.hypot(a.x, a.y, a.z)

export const normalize = (a: Point) => scale(a, 1 / length(a))

export const cosine = (a: Point, b: Point) => dot(a, b) / (length(a) * length(b))
