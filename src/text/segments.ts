export type Span = { start: number; end: number }

const wordSegmenter = new Intl.Segmenter(undefined, { granularity: "word" })

export function wordSpans(text: string): Span[] {
  return [...wordSegmenter.segment(text)]
    .filter(({ isWordLike }) => isWordLike)
    .map(({ index, segment }) => ({ start: index, end: index + segment.length }))
}
