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
const groqSuccess = { ok: true, json: async () => ({
  choices: [{ message: { content: JSON.stringify(dictionary) } }],
}) }

function routeWith(groqResponse = groqSuccess, geminiResponse = { text: JSON.stringify(dictionary) }, env = {}) {
  const geminiCalls = []
  const groqCalls = []
  const logs = []
  const module = { exports: {} }
  const mockRequire = name => {
    if (name === 'next/server') return { NextResponse: { json: (body, options) =>
      new Response(JSON.stringify(body), { status: options.status }) } }
    if (name === '@google/genai') return { GoogleGenAI: class {
      constructor(options) {
        assert.equal(options.apiKey, 'test-gemini-key')
        this.models = { generateContent: async request => {
          geminiCalls.push(request)
          if (geminiResponse instanceof Error) throw geminiResponse
          return geminiResponse
        } }
      }
    } }
    throw new Error(`Unexpected import: ${name}`)
  }
  vm.runInNewContext(compiled, { module, exports: module.exports, require: mockRequire,
    Response, TypeError, process: { env: { GROQ_API_KEY: 'test-groq-key', GEMINI_API_KEY: 'test-gemini-key', ...env } },
    fetch: async (...args) => {
      groqCalls.push(args)
      if (groqResponse instanceof Error) throw groqResponse
      return groqResponse
    },
    console: { error: (...args) => logs.push(['error', ...args]),
      info: (...args) => logs.push(['info', ...args]) } })
  return { geminiCalls, groqCalls, logs, lookup: (word = 'hus') => module.exports.POST({
    json: async () => ({ word }), headers: { get: () => { throw new Error('Client key must not be read') } },
  }) }
}

test('cached result makes no AI request', async () => {
  const module = { exports: {} }
  vm.runInNewContext(compile('../lib/lookupSavedFirst.ts'), { module, exports: module.exports })
  const route = routeWith()
  const lookup = await module.exports.lookupSavedFirst('hus', async () => dictionary, route.lookup)
  assert.deepEqual(lookup.result, dictionary)
  assert.equal(lookup.fromSavedCard, true)
  assert.equal(route.groqCalls.length, 0)
  assert.equal(route.geminiCalls.length, 0)
})

test('Groq success returns dictionary and never calls Gemini', async () => {
  const route = routeWith()
  assert.deepEqual(await (await route.lookup()).json(), dictionary)
  assert.equal(route.geminiCalls.length, 0)
  assert.equal(route.groqCalls.length, 1)
  const [url, request] = route.groqCalls[0]
  assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions')
  assert.equal(request.headers.Authorization, 'Bearer test-groq-key')
  const body = JSON.parse(request.body)
  assert.equal(body.model, 'openai/gpt-oss-120b')
  assert.equal(body.response_format.type, 'json_schema')
  assert.equal(body.response_format.json_schema.strict, false)
  assert.deepEqual(body.response_format.json_schema.schema.properties.forms,
    { type: 'object', additionalProperties: { type: 'string' } })
  assert.equal(route.logs.at(-1)[2].provider, 'Groq')
  assert.ok(!JSON.stringify(route.logs).includes('test-groq-key'))
})

test('Groq 5xx availability failure makes exactly one Gemini 3.5 fallback attempt', async () => {
  for (const status of [500, 503, 529]) {
    const route = routeWith({ ok: false, status })
    assert.deepEqual(await (await route.lookup()).json(), dictionary)
    assert.equal(route.groqCalls.length, 1)
    assert.deepEqual(route.geminiCalls.map(request => request.model), ['gemini-3.5-flash-lite'])
    assert.equal(route.geminiCalls[0].config.responseMimeType, 'application/json')
    assert.deepEqual(route.logs.map(log => log[2].provider), ['Groq', 'Gemini'])
  }
})

test('Groq 429 is explicit and never falls back', async () => {
  const route = routeWith({ ok: false, status: 429 })
  const response = await route.lookup()
  assert.equal(response.status, 429)
  assert.match((await response.json()).error, /Groq rate limit/i)
  assert.equal(route.groqCalls.length, 1)
  assert.equal(route.geminiCalls.length, 0)
})

test('Groq non-retryable error and invalid output do not trigger Gemini', async () => {
  for (const [groqResponse, expectedStatus] of [
    [{ ok: false, status: 400 }, 400], [{ ok: false, status: 401 }, 401],
    [{ ok: true, json: async () => ({ choices: [{ message: { content: '{"forms":{}}' } }] }) }, 502],
    [error(418, 'application bug with private details'), 502],
  ]) {
    const route = routeWith(groqResponse)
    const response = await route.lookup()
    assert.equal(response.status, expectedStatus)
    assert.equal(route.geminiCalls.length, 0)
    assert.ok(!JSON.stringify(route.logs).includes('private details'))
  }
})

test('Groq 503 and Gemini failure return a safe user-facing error', async () => {
  const route = routeWith({ ok: false, status: 503 }, error(503, 'private Gemini details'))
  const response = await route.lookup()
  assert.equal(response.status, 502)
  assert.match((await response.json()).error, /both dictionary providers/i)
  assert.equal(route.groqCalls.length, 1)
  assert.equal(route.geminiCalls.length, 1)
  assert.ok(!JSON.stringify(route.logs).includes('private Gemini details'))
})

test('Groq 503 and Gemini 429 report fallback quota without another retry', async () => {
  const route = routeWith({ ok: false, status: 503 }, error(429, 'RESOURCE_EXHAUSTED'))
  const response = await route.lookup()
  assert.equal(response.status, 429)
  assert.match((await response.json()).error, /Gemini fallback rate limit/i)
  assert.equal(route.geminiCalls.length, 1)
})

test('Groq 503 and Gemini authentication failure report the fallback key issue', async () => {
  const route = routeWith({ ok: false, status: 503 }, error(401, 'private Gemini details'))
  const response = await route.lookup()
  assert.equal(response.status, 401)
  assert.match((await response.json()).error, /Gemini fallback rejected its server API key/i)
  assert.equal(route.geminiCalls.length, 1)
})

test('missing Groq key does not use Gemini, and missing fallback key is explicit', async () => {
  const absentPrimary = routeWith(groqSuccess, undefined, { GROQ_API_KEY: '' })
  const primaryResponse = await absentPrimary.lookup()
  assert.equal(primaryResponse.status, 503)
  assert.match((await primaryResponse.json()).error, /Groq API key is not configured/i)
  assert.equal(absentPrimary.geminiCalls.length, 0)
  const absentFallback = routeWith({ ok: false, status: 503 }, undefined, { GEMINI_API_KEY: '' })
  const response = await absentFallback.lookup()
  assert.equal(response.status, 503)
  assert.match((await response.json()).error, /fallback is not configured/i)
})
