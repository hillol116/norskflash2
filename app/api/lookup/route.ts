import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'

const GEMINI_MODEL = 'gemini-3.5-flash-lite'
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
  if (!key) throw Object.assign(new Error('Groq API key is not configured.'), { configurationError: true })
  let response: Response
  try { response = await fetch(GROQ_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: GROQ_MODEL, messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_schema', json_schema: {
        name: 'dictionary_lookup', strict: false, schema: dictionarySchema,
      } }, stream: false }),
  }) } catch (err) {
    // Network transport failures are availability errors; other bugs must surface normally.
    if (err instanceof TypeError) throw Object.assign(new Error('Groq connection failed.'), { status: 503 })
    throw err
  }
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

function safeStatus(err: unknown): number | 'unknown' {
  const code = (err as { status?: unknown; code?: unknown } | null)?.status ??
    (err as { code?: unknown } | null)?.code
  const numeric = typeof code === 'string' && /^\d{3}$/.test(code) ? Number(code) : code
  return typeof numeric === 'number' && Number.isInteger(numeric) && numeric >= 400 && numeric <= 599
    ? numeric : 'unknown'
}

function geminiRateLimited(err: unknown): boolean {
  const upstream = err as { status?: number | string; code?: number | string; message?: string } | null
  return safeStatus(err) === 429 || upstream?.code === 'RESOURCE_EXHAUSTED' ||
    /\b(429|RESOURCE_EXHAUSTED)\b/i.test(upstream?.message ?? '')
}

export async function POST(req: NextRequest) {
  let attemptedGemini = false
  try {
    const { word } = await req.json()
    if (typeof word !== 'string' || !word.trim()) {
      return NextResponse.json({ error: 'Enter a Norwegian word to look up.' }, { status: 400 })
    }
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

    try {
      const result = await groqLookup(prompt)
      console.info('Dictionary lookup served', { provider: 'Groq', model: GROQ_MODEL })
      return new Response(result, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    } catch (err: unknown) {
      const status = safeStatus(err)
      console.error('Dictionary lookup model failed', { provider: 'Groq', model: GROQ_MODEL, status })
      if ((err as { configurationError?: boolean })?.configurationError) {
        return NextResponse.json({ error: 'Groq API key is not configured on the server.' }, { status: 503 })
      }
      if (status === 429) {
        return NextResponse.json({ error: 'Groq rate limit reached. Please wait and try again.' }, { status: 429 })
      }
      if (status === 400 || status === 401 || status === 403 || status === 404) {
        return NextResponse.json({ error: status === 401 || status === 403
          ? 'Groq authentication failed. Check the server API key.'
          : 'Groq could not process this lookup. Please try another word.' }, { status })
      }
      if (typeof status !== 'number' || status < 500 || status > 599) {
        return NextResponse.json({ error: 'Groq returned an invalid dictionary result. Please try again.' }, { status: 502 })
      }
    }

    // One Gemini attempt only, and only after a Groq availability/server failure.
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Dictionary lookup is temporarily unavailable. Gemini fallback is not configured.' }, { status: 503 })
    }
    attemptedGemini = true
    const ai = new GoogleGenAI({ apiKey })
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    })
    if (!response.text) throw new Error('Gemini returned an empty dictionary result.')
    console.info('Dictionary lookup served', { provider: 'Gemini', model: GEMINI_MODEL })
    return new Response(response.text.replace(/```json/g, '').replace(/```/g, ''), {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch (err: unknown) {
    if (attemptedGemini) {
      console.error('Dictionary lookup model failed', { provider: 'Gemini', model: GEMINI_MODEL, status: safeStatus(err) })
      if (geminiRateLimited(err)) {
        return NextResponse.json({ error: 'Gemini fallback rate limit reached. Please wait and try again.' }, { status: 429 })
      }
      const status = safeStatus(err)
      if (status === 401 || status === 403) {
        return NextResponse.json({ error: 'Gemini fallback rejected its server API key.' }, { status })
      }
      if (status === 400 || status === 404) {
        return NextResponse.json({ error: 'Gemini fallback could not process this lookup.' }, { status })
      }
      return NextResponse.json({ error: 'Both dictionary providers are temporarily unavailable. Please try again later.' }, { status: 502 })
    }
    return NextResponse.json({ error: 'Could not process the lookup request.' }, { status: 400 })
  }
}
