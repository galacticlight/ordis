import { existsSync } from "node:fs"
import { join } from "node:path"

/** electron-vite with type:module emits index.mjs; Electron preload wants a real file. */
export function resolvePreload(
  dir: string,
  exists: (path: string) => boolean = existsSync
): string {
  const js = join(dir, "index.js")
  const mjs = join(dir, "index.mjs")
  if (exists(js)) return js
  if (exists(mjs)) return mjs
  return js
}
