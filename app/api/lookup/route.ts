import { NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'

export async function POST(request: Request) {
  try {
    const { word } = await request.json()
    const headerKey = request.headers.get('x-gemini-key')

    const apiKey = headerKey || process.env.GEMINI_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { error: 'No Gemini API key configured.' },
        { status: 400 }
      )
    }

    const ai = new GoogleGenAI({ apiKey })

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash', // Fastest model optimized for structured JSON outputs
      contents: `Provide Norwegian dictionary information for: "${word}". Return strict JSON only.`,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1, // Low temperature speeds up deterministic lookup generation
        maxOutputTokens: 300, // Hard limit output length to avoid long generation times
        thinkingConfig: {
          thinkingBudget: 0, // Disables extended reasoning delays for quick lookups
        },
        responseSchema: {
          type: 'OBJECT',
          properties: {
            norwegian_word: { type: 'STRING' },
            english_meaning: { type: 'STRING' },
            forms: {
              type: 'OBJECT',
              properties: {
                singular_indefinite: { type: 'STRING' },
                singular_definite: { type: 'STRING' },
                plural_indefinite: { type: 'STRING' },
                plural_definite: { type: 'STRING' },
              },
            },
            sentences: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  norwegian: { type: 'STRING' },
                  english: { type: 'STRING' },
                },
                required: ['norwegian', 'english'],
              },
            },
            nuances: { type: 'STRING' },
          },
          required: ['norwegian_word', 'english_meaning'],
        },
      },
    })

    const text = response.text || '{}'
    const parsed = JSON.parse(text)

    return NextResponse.json(parsed)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Error processing request' },
      { status: 500 }
    )
  }
}
