"use strict"

const { execFileSync } = require("node:child_process")
const { existsSync } = require("node:fs")
const { join } = require("node:path")

/**
 * electron-builder configureLocalhostAts() forces NSAllowsArbitraryLoads true
 * after mac.extendInfo is merged. Pin ATS on the packed app.
 */
function pinAts(plist) {
  execFileSync("plutil", [
    "-replace",
    "NSAppTransportSecurity.NSAllowsArbitraryLoads",
    "-bool",
    "false",
    plist
  ])
  execFileSync("plutil", [
    "-replace",
    "NSAppTransportSecurity.NSAllowsLocalNetworking",
    "-bool",
    "true",
    plist
  ])
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return
  const name = context.packager.appInfo.productFilename
  const plist = join(context.appOutDir, `${name}.app`, "Contents", "Info.plist")
  if (!existsSync(plist)) {
    throw new Error(`ATS pin: missing ${plist}`)
  }
  pinAts(plist)
}
