const SPEED_PIXELS_PER_SECOND = 40
const MIN_SECONDS = 4
const PAUSE_SECONDS = 2

export function setMarquee(element: HTMLElement, text: string) {
  const current = element.firstElementChild as HTMLElement | null

  if (current?.textContent === text) return

  const inner = document.createElement("span")

  inner.textContent = text
  element.replaceChildren(inner)
  element.scrollLeft = 0

  const overflow = Math.max(0, inner.offsetWidth - element.clientWidth)

  element.dataset.scrolling = String(overflow > 0)
  inner.style.setProperty("--shift", `${-overflow}px`)
  inner.style.setProperty("--duration", `${Math.max(MIN_SECONDS, overflow / SPEED_PIXELS_PER_SECOND + PAUSE_SECONDS)}s`)
}

export function setTicker(element: HTMLElement, text: string) {
  if (element.textContent === text) return

  element.dataset.scrolling = "false"
  element.textContent = text
  element.scrollLeft = element.scrollWidth
}
