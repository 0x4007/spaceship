import type { Finger } from "../content.ts"
import { colorPicker } from "./color-picker.ts"
import { magnifier } from "./magnifier.ts"
import { pen } from "./pen.ts"
import { placeholderTool } from "./placeholder.ts"
import type { ToolSet } from "./tool.ts"

const TOOLS: ToolSet = {
  thumb: colorPicker,
  index: magnifier,
  middle: pen,
  ring: placeholderTool("unknown"),
  pinky: placeholderTool("unknown"),
}

export const toolFor = (finger: Finger) => TOOLS[finger]
