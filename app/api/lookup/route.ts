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

    const responseStream = await ai.models.generateContentStream({
      model: 'gemini-3.6-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    })

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        for await (const chunk of responseStream) {
          if (chunk.text) {
            const cleanedText = chunk.text.replace(/```json/g, '').replace(/```/g, '')
            controller.enqueue(encoder.encode(cleanedText))
          }
        }
        controller.close()
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    })
  } catch (err: any) {
    console.error(err)
    return NextResponse.json(
      { error: err.message || 'Failed to look up word.' },
      { status: 500 }
    )
  }
}
