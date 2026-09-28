const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function compile(file) {
  return ts.transpileModule(fs.readFileSync(path.join(__dirname, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
}
const compiled = compile('../app/api/lookup/route.ts')
const dictionary = { norwegian_word: 'hus', english_meaning: 'house',
  forms: { indefinite_singular: 'hus' }, sentences: [{ norwegian: 'Et hus.', english: 'A house.' }], nuances: '' }
const error = (status, message) => Object.assign(new Error(message), { status })

function routeWith(responses, groqResponse = { ok: true, json: async () => ({
  choices: [{ message: { content: JSON.stringify(dictionary) } }],
}) }) {
  const calls = []
  const groqCalls = []
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
    Response, process: { env: { GROQ_API_KEY: 'test-groq-key' } },
    fetch: async (...args) => { groqCalls.push(args); if (groqResponse instanceof Error) throw groqResponse; return groqResponse },
    console: { error: (...args) => logs.push(['error', ...args]),
      info: (...args) => logs.push(['info', ...args]) } })
  return { calls, groqCalls, logs, lookup: () => module.exports.POST({
    json: async () => ({ word: 'hus' }), headers: { get: () => 'test-gemini-key' },
  }) }
}

test('Gemini primary success does not call Groq', async () => {
  const route = routeWith([{ text: JSON.stringify(dictionary) }])
  assert.deepEqual(await (await route.lookup()).json(), dictionary)
  assert.deepEqual(route.calls.map(call => call.model), ['gemini-3.5-flash-lite'])
  assert.equal(route.groqCalls.length, 0)
  assert.equal(route.logs.at(-1)[2].provider, 'Gemini')
})

test('primary 503 and Gemini fallback success do not call Groq', async () => {
  const route = routeWith([error(503, 'UNAVAILABLE'), { text: JSON.stringify(dictionary) }])
  assert.equal((await route.lookup()).status, 200)
  assert.deepEqual(route.calls.map(call => call.model), ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'])
  assert.equal(route.calls[0].contents, route.calls[1].contents)
  assert.equal(route.groqCalls.length, 0)
  assert.equal(route.logs.at(-1)[2].model, 'gemini-3.1-flash-lite')
})

test('both Gemini models 503 use Groq once with validated dynamic forms', async () => {
  const route = routeWith([error(503, 'UNAVAILABLE'), error(503, 'UNAVAILABLE')])
  assert.deepEqual(await (await route.lookup()).json(), dictionary)
  assert.equal(route.groqCalls.length, 1)
  const [url, request] = route.groqCalls[0]
  assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions')
  assert.equal(request.headers.Authorization, 'Bearer test-groq-key')
  const body = JSON.parse(request.body)
  assert.equal(body.model, 'openai/gpt-oss-120b')
  assert.equal(body.response_format.type, 'json_schema')
  assert.equal(body.response_format.json_schema.strict, false)
  assert.deepEqual(JSON.parse(JSON.stringify(body.response_format.json_schema.schema.properties.forms)),
    { type: 'object', additionalProperties: { type: 'string' } })
  assert.deepEqual(route.logs.map(log => log[2].model),
    ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'openai/gpt-oss-120b'])
  assert.ok(!JSON.stringify(route.logs).includes('test-groq-key'))
})

test('Gemini 429 remains explicit and skips Groq', async () => {
  for (const failures of [[error(429, 'RESOURCE_EXHAUSTED')],
    [error(503, 'UNAVAILABLE'), error(429, 'RESOURCE_EXHAUSTED')]]) {
    const route = routeWith(failures)
    const response = await route.lookup()
    assert.equal(response.status, 429)
    assert.match((await response.json()).error, /rate limit/i)
    assert.equal(route.groqCalls.length, 0)
  }
})

test('non-retryable Gemini failures skip Groq', async () => {
  for (const status of [400, 401, 403, 404]) {
    const route = routeWith([error(status, status === 400 ? 'Malformed request 503' : 'Rejected')])
    assert.equal((await route.lookup()).status, status)
    assert.equal(route.calls.length, 1)
    assert.equal(route.groqCalls.length, 0)
  }
})

test('both Gemini 503 and Groq failure return a safe error', async () => {
  for (const groqResponse of [{ ok: false, status: 429 },
    { ok: true, json: async () => ({ choices: [{ message: { content: '{"forms":{}}' } }] }) },
    error(503, 'private upstream detail')]) {
    const route = routeWith([error(503, 'UNAVAILABLE'), error(503, 'UNAVAILABLE')], groqResponse)
    const response = await route.lookup()
    assert.equal(response.status, 502)
    assert.match((await response.json()).error, /temporarily unavailable/i)
    assert.equal(route.groqCalls.length, 1)
    assert.ok(!JSON.stringify(route.logs).includes('private upstream detail'))
  }
})

test('cached word returns without calling any AI provider', async () => {
  const module = { exports: {} }
  vm.runInNewContext(compile('../lib/lookupSavedFirst.ts'), { module, exports: module.exports })
  let calls = 0
  const lookup = await module.exports.lookupSavedFirst('hus', async word => {
    assert.equal(word, 'hus')
    return dictionary
  }, async () => { calls++; throw new Error('AI provider should not be called') })
  assert.equal(lookup.fromSavedCard, true)
  assert.deepEqual(lookup.result, dictionary)
  assert.equal(calls, 0)
})
