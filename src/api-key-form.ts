export function bindApiKeyForm(form: HTMLFormElement, status: HTMLOutputElement, storageKey: string, name: string) {
  const input = form.querySelector("input")!

  input.value = localStorage.getItem(storageKey) ?? ""

  form.addEventListener("submit", (event) => {
    event.preventDefault()
    localStorage.setItem(storageKey, input.value.trim())
    status.value = `${name} api key saved`
  })
}
