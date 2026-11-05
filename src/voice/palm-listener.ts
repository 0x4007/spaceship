import { transcribeUntilCommit } from "./transcribe.ts"

type Handlers = {
  onTranscript: (text: string) => void
  onListen?: () => void
  onPartial?: (text: string) => void
  onError?: (error: unknown) => void
}

export function createPalmListener({ onTranscript, onListen, onPartial, onError = console.error }: Handlers) {
  let session: AbortController | undefined

  return (indexInPalm: boolean) => {
    if (indexInPalm && !session) listen()
    else if (!indexInPalm) session = abort(session)
  }

  function listen() {
    const controller = (session = new AbortController())

    onListen?.()
    transcribeUntilCommit(controller.signal, (text) => !controller.signal.aborted && onPartial?.(text))
      .then((text) => !controller.signal.aborted && onTranscript(text))
      .catch((error) => error.name !== "AbortError" && onError(error))
  }
}

const abort = (controller?: AbortController) => (controller?.abort(), undefined)
