import { disableSound, enableSound, restoreSound } from "./engine.ts"

const STORAGE_KEY = "sound"

export function bindSoundToggle(checkbox: HTMLInputElement) {
  checkbox.checked = false
  checkbox.addEventListener("change", () => toggle(checkbox))

  if (localStorage.getItem(STORAGE_KEY) === "on") restoreSound().then((restored) => (checkbox.checked ||= restored))
}

async function toggle(checkbox: HTMLInputElement) {
  if (!checkbox.checked) {
    disableSound()
    localStorage.setItem(STORAGE_KEY, "off")
    return
  }

  checkbox.checked = await enableSound()
  if (checkbox.checked) localStorage.setItem(STORAGE_KEY, "on")
}
