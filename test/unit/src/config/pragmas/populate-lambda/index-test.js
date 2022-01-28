let { join } = require('path')
let mockFs = require('mock-fs')
let test = require('tape')
let cwd = process.cwd()
let _defaults = join(cwd, 'src', 'defaults')
let defaultConfig = require(_defaults)
let sut = join(cwd, 'src', 'config', 'pragmas', 'populate-lambda')
let populateLambda = require(sut)

let name = 'an-event'
let src = join('proj', 'src')
let errors = []

test('Set up env', t => {
  t.plan(2)
  t.ok(populateLambda, 'Lambda populator is present')
  t.ok(defaultConfig, 'Default config is present')
})

test('Do nothing', t => {
  t.plan(4)
  let result
  let arc = {}
  let inventory = defaultConfig()
  errors = []

  result = populateLambda.events({ arc, inventory, errors })
  t.equal(result, null, 'Returned null pragma')
  t.notOk(errors.length, 'No errors returned')

  arc.events = []
  result = populateLambda.events({ arc, inventory, errors })
  t.equal(result, null, 'Returned null pragma')
  t.notOk(errors.length, 'No errors returned')
})

test('Populate Lambdas (via manifest)', t => {
  t.plan(18)
  let arc, inventory, errors, result

  function check (item) {
    t.notOk(errors.length, 'No errors returned')
    t.equal(item.name, name, 'Returned proper Lambda')
    t.equal(item.src, join(cwd, 'src', 'events', 'an-event'), 'Returned correct source path')
    t.notOk(item.plugin, 'Lambda does not have a plugin name')
    t.notOk(item.type, 'Lambda not identified as having been created by a plugin')
    t.notOk(item.build, 'Build property not set')
    t.ok(item.config.shared, 'config.shared is true')
    t.equal(item.config.views, undefined, 'config.views is undefined (not http)')
  }

  // The normal case: @pragma
  arc = { events: [ name ] }
  inventory = defaultConfig()
  errors = []
  result = populateLambda.events({ arc, inventory, errors })
  t.equal(result.length, 1, 'Returned a Lambda')
  check(result[0])

  // Special case: one pragma populates another
  // e.g. @tables populating inv['tables-streams']
  arc = {}
  inventory = defaultConfig()
  errors = []
  result = populateLambda.events({ arc, inventory, errors, pragma: [ name ] })
  t.equal(result.length, 1, 'Returned a Lambda')
  check(result[0])
})

test('Populate Lambdas (via plugin)', t => {
  t.plan(61)
  let arc = {}, inventory = defaultConfig(), result
  let item = { name, src }
  let fn = () => (item)
  let fn2x = () => ([ item, item ])
  fn.plugin = fn2x.plugin = 'plugin-name'
  fn.type = fn2x.type = 'plugin'
  inventory._project.build = 'uh-oh'
  function check (item, compiled) {
    t.notOk(errors.length, 'No errors returned')
    t.equal(item.name, name, 'Returned proper Lambda')
    t.equal(item.src, join(cwd, src), 'Returned correct source path')
    t.equal(item.plugin, fn.plugin, 'Lambda identified by plugin name')
    t.equal(item.type, fn.type, 'Lambda identified as having been created by a plugin')
    if (!compiled) {
      t.notOk(item.build, 'Build property not set')
      t.ok(item.config.shared, 'config.shared is true')
      t.equal(item.config.views, undefined, 'config.views is undefined (not http)')
    }
    else {
      t.ok(item.build, 'Build property set')
      t.equal(item.config.shared, false, 'config.shared is false')
      t.equal(item.config.views, false, 'config.views is false')
    }
  }

  // One setter, one Lambda
  inventory.plugins = { _methods: { set: { events: [ fn ] } } }
  errors = []
  result = populateLambda.events({ arc, inventory, errors })
  t.equal(result.length, 1, 'Returned a Lambda')
  check(result[0])

  // One setter, multiple Lambdas
  inventory.plugins = { _methods: { set: { events: [ fn2x ] } } }
  errors = []
  result = populateLambda.events({ arc, inventory, errors })
  t.equal(result.length, 2, 'Returned two Lambdas')
  check(result[0])
  check(result[1])

  // Multiple setters, multiple Lambdas
  inventory.plugins = { _methods: { set: { events: [ fn, fn ] } } }
  errors = []
  result = populateLambda.events({ arc, inventory, errors })
  t.equal(result.length, 2, 'Returned two Lambdas')
  check(result[0])
  check(result[1])

  // Setter is compiled
  item.build = join('proj', 'build')
  item.config = { runtime: 'rust' }
  inventory._project.customRuntimes = { rust: { type: 'compiled' } }
  inventory.plugins = { _methods: { set: { events: [ fn ] } } }
  errors = []
  result = populateLambda.events({ arc, inventory, errors })
  t.equal(result.length, 1, 'Returned a Lambda')
  check(result[0], true)

  // Setter is transpiled
  item.config = { runtime: 'typescript' }
  inventory._project.customRuntimes = { typescript: { type: 'transpiled' } }
  errors = []
  result = populateLambda.events({ arc, inventory, errors })
  t.equal(result.length, 1, 'Returned a Lambda')
  check(result[0], true)
})

test('Plugin population errors', t => {
  t.plan(26)
  let arc = {}, inventory = defaultConfig(), fn, result
  function rtn (item) {
    fn = () => (item)
    fn.plugin = 'plugin-name'
    fn.type = 'plugin'
    inventory.plugins = { _methods: { set: { events: [ fn ] } } }
  }
  function check () {
    if (errors.length) console.log(errors[0])
    t.equal(errors.length, 1, 'Returned an error')
    t.match(errors[0], /Setter plugins/, 'Got a setter plugin error')
    t.match(errors[0], /plugin: plugin-name/, 'Got a setter plugin error')
    t.match(errors[0], /method: set\.events/, 'Got a setter plugin error')
    t.notOk(result, 'No result returned')
  }

  // String
  rtn('hi')
  errors = []
  result = populateLambda.events({ arc, inventory, errors })
  check()

  // Number
  rtn(123)
  errors = []
  result = populateLambda.events({ arc, inventory, errors })
  check()

  // Bool
  rtn(true)
  errors = []
  result = populateLambda.events({ arc, inventory, errors })
  check()

  // Function
  rtn(() => {})
  errors = []
  result = populateLambda.events({ arc, inventory, errors })
  check()

  // Falsy
  rtn(undefined)
  errors = []
  result = populateLambda.events({ arc, inventory, errors })
  check()

  // Fail immediately upon setter exception
  fn = params => params.hi.there
  fn.plugin = 'plugin-name'
  fn.type = 'plugin'
  inventory.plugins = { _methods: { set: { events: [ fn ] } } }
  t.throws(() => {
    populateLambda.events({ arc, inventory, errors })
  }, /Setter plugin exception/, 'Failing setter threw')
})

test('Per-function AWS/ARC config', t => {
  t.plan(4)
  let inventory = defaultConfig()
  inventory._project.cwd = '/nada'
  inventory._project.src = '/nada/src'
  let configPath = `${inventory._project.cwd}/src/events/configured-event/config.arc`
  let config = `@aws
timeout 10
memory 128
runtime python3.8

@arc
custom setting
`
  mockFs({ [configPath]: config })
  inventory.events = [
    'unconfigured-event',
    'configured-event',
  ]
  let arc = { events: inventory.events }
  let errors = []
  let lambdas = populateLambda.events({ arc, inventory, errors })
  t.deepEqual(lambdas[0].config, inventory._project.defaultFunctionConfig, 'Config was unmodified')
  let modified = {
    timeout: 10,
    memory: 128,
    runtime: `python3.8`,
    custom: 'setting'
  }
  t.deepEqual(lambdas[1].config, { ...inventory._project.defaultFunctionConfig, ...modified }, 'Config was correctly upserted')
  t.notOk(errors.length, 'No errors returned')
  mockFs.restore()

  // Now return a Lambda config error
  config = `lolidk`
  mockFs({ [configPath]: config })
  lambdas = populateLambda.events({ arc, inventory, errors })
  t.equal(errors.length, 1, `Invalid Lambda config returned error: ${errors[0]}`)
  mockFs.restore()
})
