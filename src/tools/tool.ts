import type { Finger } from "../fingers.ts"
import type { Point } from "../point.ts"
import type { Surface } from "../tracking/overlay.ts"

export type ToolFrame = { position: Point; direction: Point; scale: number; video: HTMLVideoElement; surface: Surface }

export type Tool = { draw: (frame: ToolFrame) => void; release?: () => void; underlay?: boolean }

export type ToolDefinition = { name: string; create: () => Tool }

export type ToolSet = Record<Finger, ToolDefinition>
