import { HandLandmarker } from "@mediapipe/tasks-vision";
import type { Hand } from "./hand-tracking.ts";

const HAND_COLORS: Record<string, string> = { Left: "#fff", Right: "#0f0" };

export function drawHands(canvas: HTMLCanvasElement, hands: Hand[], labels: string[]) {
  const video = canvas.parentElement!.querySelector("video")!;
  if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
  if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  hands.forEach((points, index) => {
    const color = HAND_COLORS[labels[index]] ?? "#fff";
    drawConnections(ctx, points, color);
    drawPoints(ctx, points, color);
  });
}

function drawConnections(ctx: CanvasRenderingContext2D, points: Hand, color: string) {
  const { width, height } = ctx.canvas;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (const { start, end } of HandLandmarker.HAND_CONNECTIONS) {
    ctx.beginPath();
    ctx.moveTo(points[start].x * width, points[start].y * height);
    ctx.lineTo(points[end].x * width, points[end].y * height);
    ctx.stroke();
  }
}

function drawPoints(ctx: CanvasRenderingContext2D, points: Hand, color: string) {
  const { width, height } = ctx.canvas;
  ctx.fillStyle = color;
  for (const point of points) {
    ctx.beginPath();
    ctx.arc(point.x * width, point.y * height, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawPinchTarget(
  canvas: HTMLCanvasElement,
  center: { x: number; y: number },
  radius: number,
  tip?: { x: number; y: number },
) {
  const ctx = canvas.getContext("2d")!;
  const cx = center.x * canvas.width;
  const cy = center.y * canvas.height;
  ctx.strokeStyle = "#ff0";
  ctx.lineWidth = 2;
  if (tip) {
    ctx.beginPath();
    ctx.moveTo(tip.x * canvas.width, tip.y * canvas.height);
    ctx.lineTo(cx, cy);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, radius * canvas.width, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 255, 0, 0.3)";
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fillStyle = "#ff0";
  ctx.fill();
}
