const LOREM_IPSUM =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. "

export const stripText = (length: number) => LOREM_IPSUM.repeat(Math.ceil(length / LOREM_IPSUM.length)).slice(0, length)
