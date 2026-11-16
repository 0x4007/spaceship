import { readdirSync } from "node:fs"
import { resolve } from "node:path"
import { defineConfig } from "vite"

export default defineConfig({
  base: "/spaceship/",
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        ...Object.fromEntries(
          readdirSync(resolve(import.meta.dirname, "experiments"))
            .filter((file) => file.endsWith(".html"))
            .map((file) => [`experiments/${file.slice(0, -".html".length)}`, resolve(import.meta.dirname, "experiments", file)]),
        ),
      },
    },
  },
})
