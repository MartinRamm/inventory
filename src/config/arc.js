let { existsSync, readFileSync } = require('fs')
let { join } = require('path')

/**
 * Build the project's Architect metadata
 */
module.exports = function getArcConfig (params) {
  let { cwd, inventory } = params
  let arc = { ...inventory.arc }

  // Version
  let installed = join(cwd, 'node_modules', '@architect', 'architect', 'package.json')
  if (existsSync(installed)) {
    let { version } = JSON.parse(readFileSync(installed))
    arc.version = version
  }

  return arc
}
