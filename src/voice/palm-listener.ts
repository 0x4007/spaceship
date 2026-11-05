import { transcribeUntilCommit } from "./transcribe.ts"

export function createPalmListener(onTranscript: (text: string) => void = console.log) {
  let session: AbortController | undefined

  return (indexInPalm: boolean) => {
    if (indexInPalm && !session) listen()
    else if (!indexInPalm) session = abort(session)
  }

  function listen() {
    const controller = (session = new AbortController())

    transcribeUntilCommit(controller.signal)
      .then((text) => !controller.signal.aborted && onTranscript(text))
      .catch((error) => error.name !== "AbortError" && console.error(error))
  }
}

const abort = (controller?: AbortController) => (controller?.abort(), undefined)
