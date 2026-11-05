const PENTATONIC = [0, 2, 4, 7, 9]
const C4 = 261.63

export const pitch = (degree: number) => {
  const octave = Math.floor(degree / PENTATONIC.length)
  const semitones = PENTATONIC[((degree % PENTATONIC.length) + PENTATONIC.length) % PENTATONIC.length] + 12 * octave

  return C4 * 2 ** (semitones / 12)
}
