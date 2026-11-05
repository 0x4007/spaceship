import { log } from "./dashboard/log.ts"
import { sounds } from "./sound/sounds.ts"

type Announcement = Exclude<keyof typeof sounds, "tick">

export const announce = (event: Announcement, detail?: string) => {
  sounds[event]()
  log(event, detail)
}
