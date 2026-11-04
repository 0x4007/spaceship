import type { Finger } from "../content.ts"

export type Point = { x: number; y: number }

export type LabelStyle = { offsetY?: number; color?: string; outline?: string }

export type Surface = {
  ctx: CanvasRenderingContext2D
  toPixels: (point: Point) => readonly [number, number]
  label: (text: string, anchor: Point, style?: LabelStyle) => void
}

export type ToolFrame = { position: Point; direction: Point; scale: number; video: HTMLVideoElement; surface: Surface }

export type Tool = { draw: (frame: ToolFrame) => void }

export type ToolDefinition = { name: string; create: () => Tool }

export type ToolSet = Record<Finger, ToolDefinition>
