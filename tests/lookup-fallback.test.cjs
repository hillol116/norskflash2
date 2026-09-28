const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const source = fs.readFileSync(path.join(__dirname, '../app/api/lookup/route.ts'), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

function routeWith(responses) {
  const calls = []
  const logs = []
  const module = { exports: {} }
  const mockRequire = name => {
    if (name === 'next/server') return { NextResponse: { json: (body, options) =>
      new Response(JSON.stringify(body), { status: options.status }) } }
    if (name === '@google/genai') return { GoogleGenAI: class {
      constructor() { this.models = { generateContent: async options => {
        calls.push(options)
        const next = responses.shift()
        if (next instanceof Error) throw next
        return next
      } } }
    } }
    throw new Error(`Unexpected import: ${name}`)
  }
  vm.runInNewContext(compiled, { module, exports: module.exports, require: mockRequire,
    Response, console: { error: (...args) => logs.push(['error', ...args]),
      info: (...args) => logs.push(['info', ...args]) } })
  return { calls, logs, lookup: () => module.exports.POST({
    json: async () => ({ word: 'hus' }), headers: { get: () => 'test-key' },
  }) }
}

const dictionary = JSON.stringify({ norwegian_word: 'hus', english_meaning: 'house',
  forms: { indefinite_singular: 'hus' }, sentences: [{ norwegian: 'Et hus.', english: 'A house.' }], nuances: '' })
const error = (status, message) => Object.assign(new Error(message), { status })

test('primary success keeps JSON response and logs the serving model', async () => {
  const route = routeWith([{ text: dictionary }])
  const response = await route.lookup()
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), JSON.parse(dictionary))
  assert.deepEqual(route.calls.map(call => call.model), ['gemini-3.5-flash-lite'])
  assert.equal(route.calls[0].config.responseMimeType, 'application/json')
  assert.deepEqual(JSON.parse(JSON.stringify(route.logs)), [['info', 'Gemini lookup served', { model: 'gemini-3.5-flash-lite' }]])
})

test('503 uses one fallback attempt with the same prompt and schema config', async () => {
  const route = routeWith([error(503, 'This model is currently experiencing high demand.'), { text: dictionary }])
  const response = await route.lookup()
  assert.equal(response.status, 200)
  assert.deepEqual(route.calls.map(call => call.model), ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'])
  assert.equal(route.calls[0].contents, route.calls[1].contents)
  assert.deepEqual(route.calls[0].config, route.calls[1].config)
  assert.deepEqual(JSON.parse(JSON.stringify(route.logs)), [
    ['error', 'Gemini lookup model failed', { model: 'gemini-3.5-flash-lite', status: 503 }],
    ['info', 'Gemini lookup served', { model: 'gemini-3.1-flash-lite' }],
  ])
})

test('429, malformed request and authentication failures do not fall back', async () => {
  for (const [status, expected] of [[429, 429], [400, 400], [401, 401], [403, 403]]) {
    const route = routeWith([error(status, status === 429 ? 'RESOURCE_EXHAUSTED' : 'Rejected')])
    const response = await route.lookup()
    assert.equal(response.status, expected)
    assert.equal(route.calls.length, 1)
    if (status === 429) assert.match((await response.json()).error, /rate limit/i)
  }
  const conflicting = routeWith([error(400, 'Request 503 was malformed')])
  assert.equal((await conflicting.lookup()).status, 400)
  assert.equal(conflicting.calls.length, 1)
})

test('fallback failure stops after two calls and retains explicit quota handling', async () => {
  const route = routeWith([error(503, 'UNAVAILABLE'), error(429, 'RESOURCE_EXHAUSTED')])
  const response = await route.lookup()
  assert.equal(response.status, 429)
  assert.equal(route.calls.length, 2)
  assert.match((await response.json()).error, /rate limit/i)
  assert.deepEqual(route.logs.map(log => log[2].model), ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'])
})
