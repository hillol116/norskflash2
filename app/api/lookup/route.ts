import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'

const PRIMARY_MODEL = 'gemini-3.5-flash-lite'
const FALLBACK_MODEL = 'gemini-3.1-flash-lite'
const GROQ_MODEL = 'openai/gpt-oss-120b'
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'

// Dynamic grammatical keys rule out strict mode's closed-object requirement.
const dictionarySchema = {
  type: 'object',
  properties: {
    norwegian_word: { type: 'string' },
    english_meaning: { type: 'string' },
    forms: { type: 'object', additionalProperties: { type: 'string' } },
    sentences: { type: 'array', items: { type: 'object', properties: {
      norwegian: { type: 'string' }, english: { type: 'string' },
    }, required: ['norwegian', 'english'], additionalProperties: false } },
    nuances: { type: 'string' },
  },
  required: ['norwegian_word', 'english_meaning', 'forms', 'sentences', 'nuances'],
  additionalProperties: false,
}

function isDictionary(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const data = value as Record<string, unknown>
  return Object.keys(data).sort().join(',') === 'english_meaning,forms,norwegian_word,nuances,sentences' &&
    typeof data.norwegian_word === 'string' && !!data.norwegian_word.trim() &&
    typeof data.english_meaning === 'string' && !!data.english_meaning.trim() &&
    !!data.forms && typeof data.forms === 'object' && !Array.isArray(data.forms) &&
    Object.values(data.forms).every(form => typeof form === 'string') &&
    Array.isArray(data.sentences) && data.sentences.every(sentence =>
      !!sentence && typeof sentence === 'object' && !Array.isArray(sentence) &&
      Object.keys(sentence).sort().join(',') === 'english,norwegian' &&
      typeof sentence.norwegian === 'string' && typeof sentence.english === 'string') &&
    typeof data.nuances === 'string'
}

async function groqLookup(prompt: string): Promise<string> {
  const key = process.env.GROQ_API_KEY
  if (!key) throw new Error('Groq API key is not configured.')
  const response = await fetch(GROQ_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: GROQ_MODEL, messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_schema', json_schema: {
        name: 'dictionary_lookup', strict: false, schema: dictionarySchema,
      } }, stream: false }),
  })
  if (!response.ok) {
    // Never expose provider bodies or headers: they may contain private data.
    throw Object.assign(new Error('Groq lookup failed.'), { status: response.status })
  }
  const completion = await response.json()
  const content = completion?.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error('Groq returned no dictionary result.')
  let result: unknown
  try { result = JSON.parse(content) } catch { throw new Error('Groq returned invalid JSON.') }
  if (!isDictionary(result)) throw new Error('Groq returned an incomplete dictionary result.')
  return JSON.stringify(result)
}

function geminiStatus(err: unknown) {
  const upstream = err as { status?: number | string; code?: number | string; message?: string } | null
  const details = upstream?.message ?? ''
  const status = upstream?.status ?? upstream?.code
  const isRateLimited = status === 429 || status === '429' ||
    /\b(429|RESOURCE_EXHAUSTED)\b/i.test(details)
  const isClientError = [400, 401, 403, 404].includes(Number(status))
  const isUnavailable = !isClientError && !isRateLimited &&
    (status === 503 || status === '503' || status === 'UNAVAILABLE' ||
      /\b(503|UNAVAILABLE)\b/i.test(details))
  return { status, isRateLimited, isUnavailable }
}

function logStatus(err: unknown) {
  const { status } = geminiStatus(err)
  return typeof status === 'number' ? status : status === 'UNAVAILABLE' ? status : 'unknown'
}

export async function POST(req: NextRequest) {
  let attemptedModel: string | null = null
  let attemptedGroq = false
  try {
    const { word } = await req.json()
    const customKey = req.headers.get('x-gemini-key')
    const apiKey = customKey || process.env.GEMINI_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Gemini API key is missing.' },
        { status: 400 }
      )
    }

    const ai = new GoogleGenAI({ apiKey })

    const prompt = `You are a precise Norwegian-English dictionary.
Provide full details for the Norwegian word: "${word}".

Determine the part of speech and populate the "forms" object dynamically:
- For Nouns: use keys "indefinite_singular", "definite_singular", "indefinite_plural", "definite_plural".
- For Verbs: use keys "infinitive", "present", "past", "past_participle".
- For Adjectives: use keys "masculine_feminine", "neuter", "plural_definite", "comparative", "superlative".

Return ONLY raw valid JSON matching this schema (do NOT use markdown backticks):
{
  "norwegian_word": "${word}",
  "english_meaning": "translation",
  "forms": {
    "key_1": "value_1",
    "key_2": "value_2"
  },
  "sentences": [
    { "norwegian": "...", "english": "..." }
  ],
  "nuances": "..."
}`

    const generate = (model: string) => {
      attemptedModel = model
      return ai.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      })
    }

    let response
    try {
      response = await generate(PRIMARY_MODEL)
    } catch (err: unknown) {
      const failure = geminiStatus(err)
      console.error('Gemini lookup model failed', { model: PRIMARY_MODEL, status: logStatus(err) })
      if (failure.isRateLimited || !failure.isUnavailable) throw err
      try {
        response = await generate(FALLBACK_MODEL)
      } catch (fallbackError: unknown) {
        console.error('Gemini lookup model failed', { model: FALLBACK_MODEL, status: logStatus(fallbackError) })
        if (!geminiStatus(fallbackError).isUnavailable) throw fallbackError
        attemptedGroq = true
        const result = await groqLookup(prompt)
        console.info('Dictionary lookup served', { provider: 'Groq', model: GROQ_MODEL })
        return new Response(result, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
      }
    }

    if (!response.text) throw new Error('Gemini returned an empty dictionary result.')
    console.info('Dictionary lookup served', { provider: 'Gemini', model: attemptedModel })
    return new Response(response.text.replace(/```json/g, '').replace(/```/g, ''), {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    })
  } catch (err: unknown) {
    if (attemptedGroq) {
      const status = (err as { status?: unknown })?.status
      console.error('Dictionary lookup model failed', { provider: 'Groq', model: GROQ_MODEL,
        status: typeof status === 'number' ? status : 'unknown' })
    }
    const upstream = err as { status?: number | string; code?: number; message?: string }
    const { isRateLimited } = geminiStatus(err)
    if (attemptedGroq) {
      return NextResponse.json({ error: 'Dictionary lookup is temporarily unavailable. Please try again later.' }, { status: 502 })
    }
    if (isRateLimited) {
      return NextResponse.json({ error: 'Gemini rate limit reached. Please wait and try again; if your daily free quota is exhausted, try again tomorrow.' }, { status: 429 })
    }
    const status = typeof upstream?.status === 'number' ? upstream.status : upstream?.code
    const safeStatus = status === 400 || status === 401 || status === 403 || status === 404 || status === 503 ? status : 502
    return NextResponse.json(
      { error: safeStatus === 401 || safeStatus === 403 ? 'Gemini rejected the API key. Check the key in Settings.'
        : safeStatus === 404 ? 'Gemini model unavailable for this API key.'
        : safeStatus === 400 ? 'Gemini could not process this lookup. Try another word.'
        : 'Gemini lookup is temporarily unavailable. Please try again.' },
      { status: safeStatus }
    )
  }
}
