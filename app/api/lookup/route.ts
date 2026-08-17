import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

export async function POST(request: Request) {
  try {
    const { word, apiKey: userKey } = await request.json()

    // Priority: 1. User key passed from browser, 2. Vercel environment key
    const apiKey = userKey || process.env.GEMINI_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { error: 'No Gemini API key configured.' },
        { status: 400 }
      )
    }

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    const prompt = `Provide detailed Norwegian dictionary information for the word "${word}". Return response as JSON.`
    const result = await model.generateContent(prompt)
    const text = result.response.text()

    return NextResponse.json({ result: text })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Error processing request' },
      { status: 500 }
    )
  }
}
