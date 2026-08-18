import { GoogleGenAI, Type } from '@google/genai'

export async function POST(request: Request) {
  try {
    const { word } = await request.json()
    const headerKey = request.headers.get('x-gemini-key')
    const apiKey = headerKey || process.env.GEMINI_API_KEY

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'No API key configured.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const ai = new GoogleGenAI({ apiKey })

    // Stream directly from Gemini 3.6 Flash
    const responseStream = await ai.models.generateContentStream({
      model: 'gemini-3.6-flash',
      contents: `Provide Norwegian dictionary entry for: "${word}"`,
      config: {
        systemInstruction: 'You are a precise dictionary database. Output pure JSON without meta-commentary, explanations, or thinking dialogue.',
        responseMimeType: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 500,
        thinkingConfig: {
          thinkingBudget: 1024,
        },
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            norwegian_word: { type: Type.STRING },
            english_meaning: { type: Type.STRING },
            forms: {
              type: Type.OBJECT,
              properties: {
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

    // Create a ReadableStream so Next.js forwards chunks immediately
    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        for await (const chunk of responseStream) {
          if (chunk.text) {
            controller.enqueue(encoder.encode(chunk.text))
          }
        }
        controller.close()
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
}
