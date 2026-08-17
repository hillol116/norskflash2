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
      model: 'gemini-3.6-flash',
      contents: `Provide detailed Norwegian dictionary information for the word "${word}". Return response as JSON containing: norwegian_word, english_meaning, forms (object with grammatical forms), sentences (array of objects with norwegian and english keys), and nuances.`,
      config: {
        responseMimeType: 'application/json',
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
