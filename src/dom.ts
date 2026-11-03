export const $ = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector)!

export const $$ = <T extends Element>(selector: string) => [...document.querySelectorAll<T>(selector)]

export const showError = (output: HTMLOutputElement, error: unknown) =>
  (output.value = `error: ${error instanceof Error ? error.message : error}`)

export function downloadJson(filename: string, data: unknown) {
  const link = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" })),
    download: filename,
  })

  link.click()
  URL.revokeObjectURL(link.href)
}
