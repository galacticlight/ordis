"use strict"

/**
 * Pack-time vendor: q8 Kokoro ONNX (onnx-community/Kokoro-82M-v1.0-ONNX) and
 * a platform espeak-ng binary (+ dylibs/data on mac/linux). Do not commit the blobs.
 */

const { execFileSync, spawnSync } = require("node:child_process")
const {
  chmodSync,
  copyFileSync,
  cpSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync
} = require("node:fs")
const https = require("node:https")
const { basename, dirname, join } = require("node:path")
const { pipeline } = require("node:stream/promises")

const ROOT = join(__dirname, "..")
const VENDOR = join(ROOT, "vendor", "voice")
const KOKORO_ROOT = join(VENDOR, "kokoro")
const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX"
const MODEL_DIR = join(KOKORO_ROOT, MODEL_ID)
const ESPEAK_DIR = join(VENDOR, "espeak-ng")
const HF = "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main"

const KOKORO_FILES = [
  "config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "onnx/model_quantized.onnx",
  "voices/am_michael.bin",
  "voices/am_puck.bin"
]

function log(message) {
  console.log(`[vendor-voice] ${message}`)
}

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true })
}

function download(url, dest) {
  ensureDir(dirname(dest))
  return new Promise((resolve, reject) => {
    const request = (current) => {
      https
        .get(current, { headers: { "user-agent": "ordis-vendor-voice" } }, (res) => {
          const status = res.statusCode ?? 0
          if (status >= 300 && status < 400 && res.headers.location) {
            res.resume()
            request(res.headers.location)
            return
          }
          if (status !== 200) {
            res.resume()
            reject(new Error(`download ${current} failed (${status})`))
            return
          }
          const out = createWriteStream(dest)
          pipeline(res, out).then(resolve).catch(reject)
        })
        .on("error", reject)
    }
    request(url)
  })
}

async function vendorKokoro() {
  for (const rel of KOKORO_FILES) {
    const dest = join(MODEL_DIR, rel)
    if (existsSync(dest) && statSync(dest).size > 0) {
      log(`keep ${rel}`)
      continue
    }
    log(`fetch ${rel}`)
    await download(`${HF}/${rel}?download=true`, dest)
  }
}

function systemLib(path) {
  return (
    path.startsWith("/usr/lib") ||
    path.startsWith("/lib") ||
    path.startsWith("/System/") ||
    path.includes("libSystem") ||
    path.includes("linux-vdso") ||
    path.includes("ld-linux")
  )
}

function collectMacDylibs(binary) {
  const seen = new Set()
  const queue = [binary]
  while (queue.length > 0) {
    const next = queue.pop()
    if (!next || seen.has(next) || systemLib(next) || !existsSync(next)) continue
    seen.add(next)
    const out = spawnSync("otool", ["-L", next], { encoding: "utf8" })
    for (const line of (out.stdout ?? "").split("\n").slice(1)) {
      const match = line.trim().match(/^(\S+)/)
      if (!match) continue
      let lib = match[1]
      if (lib.startsWith("@")) continue
      if (!systemLib(lib) && existsSync(lib) && !seen.has(lib)) queue.push(lib)
    }
  }
  seen.delete(binary)
  return [...seen]
}

function rewriteMacNames(binPath, libDir) {
  try {
    execFileSync("install_name_tool", ["-add_rpath", "@executable_path/../lib", binPath])
  } catch {
    // rpath may already exist
  }
  const out = spawnSync("otool", ["-L", binPath], { encoding: "utf8" })
  for (const line of (out.stdout ?? "").split("\n").slice(1)) {
    const match = line.trim().match(/^(\S+)/)
    if (!match) continue
    const lib = match[1]
    if (lib.startsWith("@") || systemLib(lib)) continue
    const name = basename(lib)
    const dest = join(libDir, name)
    if (!existsSync(dest)) continue
    execFileSync("install_name_tool", ["-change", lib, `@executable_path/../lib/${name}`, binPath])
  }
  for (const name of readdirSync(libDir)) {
    const dylib = join(libDir, name)
    try {
      execFileSync("install_name_tool", ["-id", `@executable_path/../lib/${name}`, dylib])
    } catch {
      // best-effort
    }
    const deps = spawnSync("otool", ["-L", dylib], { encoding: "utf8" })
    for (const line of (deps.stdout ?? "").split("\n").slice(1)) {
      const match = line.trim().match(/^(\S+)/)
      if (!match) continue
      const lib = match[1]
      if (lib.startsWith("@") || systemLib(lib)) continue
      const depName = basename(lib)
      if (!existsSync(join(libDir, depName))) continue
      try {
        execFileSync("install_name_tool", ["-change", lib, `@executable_path/../lib/${depName}`, dylib])
      } catch {
        // best-effort
      }
    }
  }
}

function copyDataDir(src, dest) {
  if (!existsSync(src)) {
    throw new Error(`espeak-ng data missing: ${src}`)
  }
  ensureDir(dirname(dest))
  cpSync(src, dest, { recursive: true })
}

function vendorMacEspeak() {
  let prefix = ""
  try {
    prefix = execFileSync("brew", ["--prefix", "espeak-ng"], { encoding: "utf8" }).trim()
  } catch {
    prefix = ""
  }
  if (!prefix || !existsSync(join(prefix, "bin", "espeak-ng"))) {
    log("homebrew espeak-ng missing; installing formula")
    execFileSync("brew", ["install", "espeak-ng"], { stdio: "inherit" })
    prefix = execFileSync("brew", ["--prefix", "espeak-ng"], { encoding: "utf8" }).trim()
  }
  const binSrc = prefix ? join(prefix, "bin", "espeak-ng") : ""
  const which = spawnSync("which", ["espeak-ng"], { encoding: "utf8" })
  const pathBin = which.status === 0 ? which.stdout.trim() : ""
  const src = existsSync(binSrc) ? binSrc : pathBin
  if (!src || !existsSync(src)) {
    throw new Error("espeak-ng not found; install with Homebrew (brew install espeak-ng)")
  }
  const binDir = join(ESPEAK_DIR, "bin")
  const libDir = join(ESPEAK_DIR, "lib")
  ensureDir(binDir)
  ensureDir(libDir)
  const destBin = join(binDir, "espeak-ng")
  copyFileSync(src, destBin)
  chmodSync(destBin, 0o755)
  for (const lib of collectMacDylibs(src)) {
    copyFileSync(lib, join(libDir, basename(lib)))
  }
  rewriteMacNames(destBin, libDir)
  const dataSrc = prefix
    ? join(prefix, "share", "espeak-ng-data")
    : "/opt/homebrew/share/espeak-ng-data"
  copyDataDir(dataSrc, join(ESPEAK_DIR, "share", "espeak-ng-data"))
  log(`espeak-ng darwin -> ${destBin}`)
}

function vendorLinuxEspeak() {
  const which = spawnSync("which", ["espeak-ng"], { encoding: "utf8" })
  const src = existsSync("/usr/bin/espeak-ng")
    ? "/usr/bin/espeak-ng"
    : which.status === 0
      ? which.stdout.trim()
      : ""
  if (!src || !existsSync(src)) {
    throw new Error("espeak-ng not found; install with apt (sudo apt install espeak-ng)")
  }
  const binDir = join(ESPEAK_DIR, "bin")
  const libDir = join(ESPEAK_DIR, "lib")
  ensureDir(binDir)
  ensureDir(libDir)
  const destBin = join(binDir, "espeak-ng")
  copyFileSync(src, destBin)
  chmodSync(destBin, 0o755)
  const ldd = spawnSync("ldd", [src], { encoding: "utf8" })
  for (const line of (ldd.stdout ?? "").split("\n")) {
    const match = line.match(/=>\s+(\/\S+)/) || line.trim().match(/^(\/\S+\.so\S*)/)
    if (!match) continue
    const lib = match[1]
    if (!lib || !existsSync(lib)) continue
    if (lib.includes("libespeak") || lib.includes("pcaudio") || lib.includes("sonic")) {
      copyFileSync(lib, join(libDir, basename(lib)))
    }
  }
  const dataCandidates = ["/usr/share/espeak-ng-data", "/usr/local/share/espeak-ng-data"]
  const dataSrc = dataCandidates.find((dir) => existsSync(dir))
  if (!dataSrc) throw new Error("espeak-ng-data not found")
  copyDataDir(dataSrc, join(ESPEAK_DIR, "share", "espeak-ng-data"))
  log(`espeak-ng linux -> ${destBin}`)
}

function vendorEspeak() {
  if (process.platform === "darwin") {
    vendorMacEspeak()
    return
  }
  if (process.platform === "linux") {
    vendorLinuxEspeak()
    return
  }
  log(`skip espeak-ng on ${process.platform}`)
}

async function main() {
  ensureDir(KOKORO_ROOT)
  ensureDir(ESPEAK_DIR)
  await vendorKokoro()
  vendorEspeak()
  log("voice extras ready")
}

main().catch((error) => {
  console.error("[vendor-voice]", error instanceof Error ? error.message : error)
  process.exit(1)
})
