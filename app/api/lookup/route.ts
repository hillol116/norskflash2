import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

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

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.6-flash',
      generationConfig: {
        responseMimeType: 'application/json',
      },
    })

    const prompt = `You are a precise Norwegian-English dictionary.
Provide full details for the Norwegian word: "${word}".

Return ONLY raw valid JSON matching this schema (do NOT use markdown backticks):
{
  "norwegian_word": "word",
  "english_meaning": "translation",
  "forms": {
    "indefinite_singular": "...",
    "definite_singular": "...",
    "indefinite_plural": "...",
    "definite_plural": "..."
  },
  "sentences": [
    { "norwegian": "...", "english": "..." }
  ],
  "nuances": "..."
}`

    const resultStream = await model.generateContentStream(prompt)

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        for await (const chunk of resultStream.stream) {
          const text = chunk.text()
          const cleanedText = text.replace(/```json/g, '').replace(/```/g, '')
          controller.enqueue(encoder.encode(cleanedText))
        }
        controller.close()
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json(
      { error: 'Failed to look up word.' },
      { status: 500 }
    )
  }
}
