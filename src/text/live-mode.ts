export function clearLegacyKeys() {
  try {
    localStorage.removeItem("cerebras-api-key")
    localStorage.removeItem("gemini-api-key")
  } catch {
    // Storage restrictions must not prevent session-authenticated inference.
  }
}

export function bindModeToggle(toggle: HTMLButtonElement, isLive: boolean) {
  toggle.setAttribute("aria-pressed", `${isLive}`)
  toggle.querySelector("b")!.textContent = isLive ? "flight" : "sim"

  toggle.addEventListener("click", () => {
    const url = new URL(location.href)
    if (isLive) url.searchParams.set("live", "false")
    else url.searchParams.delete("live")
    location.assign(url)
  })
}
