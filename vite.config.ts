import { resolve } from "node:path"
import { defineConfig } from "vite"

export default defineConfig({
  base: "/handstorm/",
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        trainer: resolve(import.meta.dirname, "trainer.html"),
        chat: resolve(import.meta.dirname, "chat.html"),
        text: resolve(import.meta.dirname, "text.html"),
        soundboard: resolve(import.meta.dirname, "soundboard.html"),
        elevenlabs: resolve(import.meta.dirname, "elevenlabs.html"),
      },
    },
  },
})
