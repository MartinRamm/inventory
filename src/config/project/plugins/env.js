let { is } = require('../../../lib')
let envs = [ 'testing', 'staging', 'production' ]
let str = value => {
  if (is.object(value) || is.array(value)) return JSON.stringify(value)
  return String(value)
}

module.exports = function setEnvPlugins (params, project) {
  let { errors, inventory } = params
  let envPlugins = inventory.plugins?._methods?.set?.env
  if (envPlugins?.length) {
    let env = {
      testing: null,
      staging: null,
      production: null,
    }

    // IEEE 1003.1-2001 does not allow lowercase, so consider this a compromise for the Windows folks in the house
    let validName = /^[a-zA-Z0-9_]+$/

    // inventory._project is not yet built, so provide as much as we can to plugins for now
    let inv = { ...inventory, _project: project }
    envPlugins.forEach(fn => {
      let errType = `plugin: ${fn.plugin}, method: set.env`
      try {
        let result = fn({ inventory: { inv } })
        if (!is.object(result) || !Object.keys(result).length) {
          return errors.push(`Env plugin returned invalid data, must return an Object with one or more keys + values: ${errType}`)
        }
        // Populate env vars based on environment
        // If any keys are environment names, disregard all keys except environment names
        if (Object.keys(result).some(k => envs.includes(k))) {
          envs.forEach(e => {
            if (result[e]) Object.entries(result[e]).forEach(([ k, v ]) => {
              let errored = false, val = str(v)
              if (!env[e]) env[e] = { [k]: val }
              else if (env[e][k] && !errored) {
                errored = true
                errors.push(`Env var '${k}' already registered: ${errType}`)
              }
              else env[e][k] = val
            })
          })
        }
        // Populate all environments based on env var
        else {
          Object.entries(result).forEach(([ k, v ]) => {
            if (!validName.test(k)) {
              return errors.push(`Env var '${k}' is invalid, must be [a-zA-Z0-9_]`)
            }
            let errored = false, val = str(v)
            envs.forEach(e => {
              if (!env[e]) env[e] = { [k]: val }
              else if (env[e][k] && !errored) {
                errored = true
                errors.push(`Env var '${k}' already registered: ${errType}`)
              }
              else env[e][k] = val
            })
          })
        }
      }
      catch (err) {
        errors.push(`Runtime plugin '${fn.plugin}' failed: ${err.message}`)
      }
    })
    return env
  }
  return inventory._project.env.plugins
}
