import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI, Type } from '@google/genai'

export type WordForms = {
  infinitive?: string
  present?: string
  past?: string
  perfect?: string
  plural?: string
}

export type ExampleSentence = {
  norwegian: string
  english: string
}

export type LookupResult = {
  norwegian_word: string
  english_meaning: string
  forms: WordForms
  sentences: ExampleSentence[]
  nuances: string
}

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    norwegian_word: { type: Type.STRING },
    english_meaning: { type: Type.STRING },
    forms: {
      type: Type.OBJECT,
      properties: {
        infinitive: { type: Type.STRING },
        present: { type: Type.STRING },
        past: { type: Type.STRING },
        perfect: { type: Type.STRING },
        plural: { type: Type.STRING },
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
        propertyOrdering: ['norwegian', 'english'],
      },
    },
    nuances: { type: Type.STRING },
  },
  propertyOrdering: [
    'norwegian_word',
    'english_meaning',
    'forms',
    'sentences',
    'nuances',
  ],
} as const

export async function POST(req: NextRequest) {
  try {
    const userKey = req.headers.get('x-gemini-key')?.trim()
    const apiKey = userKey || process.env.GEMINI_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            'No Gemini API key configured. Add your key in Settings or set GEMINI_API_KEY on the server.',
        },
        { status: 401 }
      )
    }

    const body = await req.json()
    const word = (body?.word ?? '').toString().trim()
    if (!word) {
      return NextResponse.json(
        { error: 'Please provide a Norwegian word to look up.' },
        { status: 400 }
      )
    }

    const ai = new GoogleGenAI({ apiKey })

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: `You are a Norwegian language dictionary. For the Norwegian word "${word}", return accurate dictionary information including its English meaning, grammatical forms (infinitive, present, past, perfect, plural — leave blank if not applicable for the part of speech), 3 example sentences with Norwegian and English translations, and short cultural/usage nuances. Respond in JSON.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema,
      },
    })

    const raw = response.text
    if (!raw) {
      return NextResponse.json(
        { error: 'The AI did not return any content. Try again.' },
        { status: 502 }
      )
    }

    let parsed: LookupResult
    try {
      parsed = JSON.parse(raw) as LookupResult
    } catch {
      return NextResponse.json(
        { error: 'The AI returned malformed data. Try again.' },
        { status: 502 }
      )
    }

    if (!parsed.norwegian_word || !parsed.english_meaning) {
      return NextResponse.json(
        { error: 'The AI response was missing required fields. Try again.' },
        { status: 502 }
      )
    }

    parsed.forms = parsed.forms ?? {}
    parsed.sentences = Array.isArray(parsed.sentences) ? parsed.sentences : []
    parsed.nuances = parsed.nuances ?? ''

    return NextResponse.json(parsed)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
