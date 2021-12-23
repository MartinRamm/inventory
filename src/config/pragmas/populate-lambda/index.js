let read = require('../../../read')
let getLambda = require('./get-lambda')
let getRuntime = require('./get-runtime')
let getHandler = require('./get-handler')
let upsert = require('../../_upsert')
let defaultFunctionConfig = require('../../../defaults/function-config')
let is = require('../../../lib/is')

/**
 * Build out the Lambda tree from the Arc manifest or a passed pragma, and plugins
 */
function populateLambda (type, { arc, inventory, errors, pragma }) {
  let plugins = inventory._project.plugins?._methods?.set?.[type]
  let pluginLambda = []
  if (plugins) {
    let pluginResults = plugins.flatMap(fn => {
      let result = fn({ arc, inventory })
      result.plugin = fn.plugin
      return result
    })
    pluginLambda = populate(type, pluginResults, inventory, errors, true) || []
  }
  let pragmaLambda = populate(type, pragma || arc[type], inventory, errors) || []
  let aggregate = [ ...pluginLambda, ...pragmaLambda ]
  return aggregate.length ? aggregate : null
}

function populate (type, pragma, inventory, errors, plugin) {
  if (!pragma || !pragma.length) return

  let defaultProjectConfig = () => JSON.parse(JSON.stringify(inventory._project.defaultFunctionConfig))
  let cwd = inventory._project.src

  // Fill er up
  let lambdas = []

  for (let item of pragma) {
    // Get name, source dir, and any pragma-specific properties
    let results = getLambda({ type, item, cwd, inventory, errors, plugin })
    // Some lambda populators (e.g. plugins) may return empty results
    if (!results) continue
    // Some lambda populators (e.g. plugins) may return multiple results
    if (!is.array(results)) results = [ results ]

    results.forEach(result => {
      let { name, src } = result
      // Set up fresh config, then overlay plugin config
      let config = defaultProjectConfig()
      config = { ...config, ...getKnownProps(configProps, result.config) }

      // Knock out any pragma-specific early
      if (type === 'queues') {
        config.fifo = config.fifo === undefined ? true : config.fifo
      }
      if (type === 'http') {
        if (name.startsWith('get ') || name.startsWith('any ')) config.views = true
      }

      // Now let's check in on the function config
      let { arc: arcConfig, filepath } = read({ type: 'functionConfig', cwd: src, errors })

      // Set function config file path (if one is present)
      let configFile = filepath ? filepath : null

      // Layer any function config over Arc / project defaults
      if (arcConfig && arcConfig.aws) {
        config = upsert(config, arcConfig.aws)
      }
      if (arcConfig && arcConfig.arc) {
        config = upsert(config, arcConfig.arc)
      }

      // Interpolate runtimes
      config = getRuntime(config)

      // Tidy up any irrelevant properties
      if (type !== 'http') {
        delete config.apigateway
      }

      // Now we know the final source dir + runtime + handler: assemble handler props
      let { handlerFile, handlerFunction } = getHandler(config, src, errors)

      let lambda = {
        name,
        config,
        src,
        handlerFile,
        handlerFunction,
        configFile,
        ...getKnownProps(lambdaProps, result), // Any other pragma-specific stuff
      }

      lambdas.push(lambda)
    })
  }

  return lambdas
}

// Lambda setter plugins can technically return anything, so this ensures everything is tidy
let lambdaProps = [ 'cron', 'method', 'path', 'plugin', 'rate', 'route', 'table' ]
let configProps = [ ...Object.keys(defaultFunctionConfig()), 'fifo', 'views' ]
let getKnownProps = (knownProps, raw = {}) => {
  let props = knownProps.flatMap(prop => is.defined(raw[prop]) ? [ [ prop, raw[prop] ] ] : [])
  return Object.fromEntries(props)
}

let ts = 'tables-streams'

module.exports = {
  events:     populateLambda.bind({}, 'events'),
  http:       populateLambda.bind({}, 'http'),
  plugins:    populateLambda.bind({}, 'plugins'),
  queues:     populateLambda.bind({}, 'queues'),
  scheduled:  populateLambda.bind({}, 'scheduled'),
  tables:     populateLambda.bind({}, 'tables'),
  [ts]:       populateLambda.bind({}, ts),
  ws:         populateLambda.bind({}, 'ws'),
}
