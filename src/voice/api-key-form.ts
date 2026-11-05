import { API_KEY_STORAGE } from "./transcribe.ts"

export function bindApiKeyForm(form: HTMLFormElement, status: HTMLOutputElement) {
  const input = form.querySelector("input")!

  input.value = localStorage.getItem(API_KEY_STORAGE) ?? ""

  form.addEventListener("submit", (event) => {
    event.preventDefault()
    localStorage.setItem(API_KEY_STORAGE, input.value.trim())
    status.value = "elevenlabs api key saved"
  })
}
