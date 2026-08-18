import { NextResponse } from 'next/server'
import { GoogleGenAI, Type } from '@google/genai'

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
      model: 'gemini-3.6-flash',
      contents: `Provide a direct dictionary entry for the Norwegian word: "${word}". Include relevant word forms (e.g., infinitive, present, past, past participle for verbs; or singular/plural forms for nouns).`,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 500,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            norwegian_word: { type: Type.STRING },
            english_meaning: { type: Type.STRING },
            forms: {
              type: Type.OBJECT,
              properties: {
                // Verb forms
                infinitive: { type: Type.STRING },
                present: { type: Type.STRING },
                past: { type: Type.STRING },
                past_participle: { type: Type.STRING },
                // Noun forms
                singular_indefinite: { type: Type.STRING },
                singular_definite: { type: Type.STRING },
                plural_indefinite: { type: Type.STRING },
                plural_definite: { type: Type.STRING },
              },
            },
            sentences: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  norwegian: { type: Type.STRING },
                  english: { type: Type.STRING },
                },
                required: ['norwegian', 'english'],
              },
            },
            nuances: { type: Type.STRING },
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
