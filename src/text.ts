import { layoutNextLine, prepareWithSegments, type PreparedTextWithSegments } from "@chenglou/pretext";
import { $ } from "./dom";
import { simulatedComplete } from "./text/completion";
import { countWords, createTextStream, type GenerationTrigger } from "./text/text-stream";

const element = $("#text");
const style = getComputedStyle(element);
const padding = parseFloat(style.paddingLeft);
const lineHeight = parseFloat(style.lineHeight);

const DWELL_MS = 100;

type Point = { x: number; y: number };

const stream = createTextStream(simulatedComplete, render);
let pointer: Point | undefined;
let shownCount: number | undefined;
let dwellTimer: number | undefined;
let prepared: { text: string; layout: PreparedTextWithSegments } | undefined;

addEventListener("pointermove", ({ pageX, pageY }) => {
  const previous = pointer;
  pointer = { x: pageX, y: pageY };
  render();
  if (previous && isAhead(pointer, previous)) generateAtEndOfText("pointer moved right");
});

function render() {
  if (!pointer) return;

  const lineCount = lineIndexAt(pointer.y) + 1;
  const lines = layoutLines(prepareWords(), lineCount, pointer.x - padding);
  const count = countWords(lines.join(" "));

  if (shownCount !== undefined && count < shownCount) stream.truncate(count);
  if (count !== shownCount) restartDwell();
  shownCount = count;
  element.textContent = lines.join("\n");
}

function restartDwell() {
  clearTimeout(dwellTimer);
  dwellTimer = setTimeout(() => generateAtEndOfText("dwell timer"), DWELL_MS);
}

function generateAtEndOfText(trigger: GenerationTrigger) {
  if (shownCount === countWords(stream.text)) stream.generate(trigger);
}

function prepareWords() {
  const text = stream.text;
  if (prepared?.text !== text) prepared = { text, layout: prepareWithSegments(text, style.font) };
  return prepared.layout;
}

function layoutLines(layout: PreparedTextWithSegments, lineCount: number, lastLineWidth: number) {
  const fullWidth = innerWidth - padding * 2;
  const lines: string[] = [];
  let cursor;
  for (let i = 0; i < lineCount; i++) {
    const width = i === lineCount - 1 ? lastLineWidth : fullWidth;
    const line = layoutNextLine(layout, width, cursor);
    if (!line || line.width > width) break;
    lines.push(line.text);
    cursor = line.end;
  }
  return lines;
}

function lineIndexAt(y: number) {
  return Math.floor((y - padding) / lineHeight);
}

function isAhead(next: Point, previous: Point) {
  const nextLine = lineIndexAt(next.y);
  const previousLine = lineIndexAt(previous.y);
  return nextLine > previousLine || (nextLine === previousLine && next.x > previous.x);
}
