import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'

export async function POST(req: NextRequest) {
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

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash-lite',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    })

    if (!response.text) throw new Error('Gemini returned an empty dictionary result.')
    return new Response(response.text.replace(/```json/g, '').replace(/```/g, ''), {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    })
  } catch (err: unknown) {
    console.error(err)
    const upstream = err as { status?: number | string; code?: number; message?: string }
    const details = upstream?.message ?? ''
    const isRateLimited = upstream?.status === 429 || upstream?.code === 429 ||
      /\b(429|RESOURCE_EXHAUSTED)\b/i.test(details)
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
