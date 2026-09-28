import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'

const PRIMARY_MODEL = 'gemini-3.5-flash-lite'
const FALLBACK_MODEL = 'gemini-3.1-flash-lite'

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
      response = await generate(FALLBACK_MODEL)
    }

    if (!response.text) throw new Error('Gemini returned an empty dictionary result.')
    console.info('Gemini lookup served', { model: attemptedModel })
    return new Response(response.text.replace(/```json/g, '').replace(/```/g, ''), {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    })
  } catch (err: unknown) {
    if (attemptedModel === FALLBACK_MODEL) {
      console.error('Gemini lookup model failed', { model: FALLBACK_MODEL, status: logStatus(err) })
    }
    const upstream = err as { status?: number | string; code?: number; message?: string }
    const details = upstream?.message ?? ''
    const { isRateLimited } = geminiStatus(err)
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
