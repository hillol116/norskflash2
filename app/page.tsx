'use client'

import { useState } from 'react'
import { useProfile } from '@/components/ProfileProvider'
import type { LookupResult } from '@/lib/types'
import FlashcardView from '@/components/FlashcardView'
import Header from '@/components/Header'

type Tab = 'dictionary' | 'flashcards'

export default function Home() {
  const {
    activeProfile,
    ready,
    geminiKey,
    flashcards = [],
    saveFlashcard,
    removeFlashcard,
  } = useProfile()

  const [tab, setTab] = useState<Tab>('dictionary')
  const [word, setWord] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<LookupResult | null>(null)
  const [savedMessage, setSavedMessage] = useState('')
  const [cardIndex, setCardIndex] = useState(0)

  // Safe fallback array for flashcards
  const safeCards = flashcards || []

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault()
    if (!word.trim()) return

    if (!activeProfile) {
      setError('Please select or create a profile first.')
      return
    }

    setLoading(true)
    setError('')
    setResult(null)
    setSavedMessage('')

    try {
      const res = await fetch('/api/lookup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gemini-key': geminiKey || '',
        },
        body: JSON.stringify({ word: word.trim() }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Lookup failed.')
      }

      setResult(data as LookupResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lookup failed.')
    } finally {
      setLoading(false)
    }
  }

  function handleSave() {
    if (!result || !activeProfile) return
    setSavedMessage('')
    try {
      saveFlashcard({
        norwegian_word: result.norwegian_word,
        english_meaning: result.english_meaning,
        forms: result.forms,
        sentences: result.sentences,
        nuances: result.nuances,
      })
      setSavedMessage('Saved to your flashcards!')
    } catch {
      setSavedMessage('Could not save the flashcard.')
    }
  }

  function handleDeleteCard(id: string) {
    removeFlashcard(id)
    setCardIndex((i) => Math.max(0, Math.min(i, safeCards.length - 2)))
  }

  function switchTab(next: Tab) {
    setTab(next)
    if (next === 'flashcards') {
      setCardIndex(0)
    }
  }

  const forms = result?.forms ?? {}
  const formEntries = Object.entries(forms).filter(([, v]) => v)
  const sentences = result?.sentences ?? []

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-sky-200 border-t-sky-600" />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-sky-50 text-slate-900">
      <Header />

      <div className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-extrabold text-slate-900">NorskFlash</h1> 
          <p className="mt-3 text-lg text-slate-600">
            Norwegian-English dictionary & flashcards
          </p>
        </div>

        {!activeProfile ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h2 className="mb-2 text-2xl font-bold text-slate-900">
              Create a profile to get started
            </h2>
            <p className="mb-6 text-slate-600">
              Use the profile menu in the top-right corner to create a profile. Each
              profile keeps its own flashcard deck.
            </p>
          </section>
        ) : (
          <>
            {/* Tabs */}
            <div className="mb-8 flex justify-center">
              <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                <button
                  onClick={() => switchTab('dictionary')}
                  className={`rounded-lg px-6 py-2 text-sm font-medium transition ${
                    tab === 'dictionary'
                      ? 'bg-sky-600 text-white shadow'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Dictionary
                </button>
                <button
                  onClick={() => switchTab('flashcards')}
                  className={`rounded-lg px-6 py-2 text-sm font-medium transition ${
                    tab === 'flashcards'
                      ? 'bg-sky-600 text-white shadow'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Flashcards
                </button>
              </div>
            </div>

            {tab === 'dictionary' && (
              <section>
                <form onSubmit={handleLookup} className="mb-6">
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input
                      type="text"
                      value={word}
                      onChange={(e) => setWord(e.target.value)}
                      placeholder="Type a Norwegian word, e.g. 'hus'"
                      className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-base shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                    />
                    <button
                      type="submit"
                      disabled={loading || !word.trim()}
                      className="rounded-xl bg-sky-600 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {loading ? 'Looking up…' : 'Look up'}
                    </button>
                  </div>
                </form>

                {error && (
                  <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                  </div>
                )}

                {loading && (
                  <div className="flex items-center justify-center py-16">
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-sky-200 border-t-sky-600" />
                  </div>
                )}

                {result && !loading && (
                  <article className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                    <div>
                      <h2 className="text-3xl font-bold text-slate-900">
                        {result.norwegian_word}
                      </h2>
                      <p className="mt-1 text-xl text-sky-700">
                        {result.english_meaning}
                      </p>
                    </div>

                    {formEntries.length > 0 && (
                      <div>
                        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
                          Grammatical forms
                        </h3>
                        <div className="overflow-hidden rounded-lg border border-slate-200">
                          <table className="w-full text-sm">
                            <tbody>
                              {formEntries.map(([k, v]) => (
                                <tr key={k} className="border-b border-slate-100 last:border-0">
                                  <td className="bg-slate-50 px-4 py-2.5 font-medium capitalize text-slate-600">
                                    {k.replace('_', ' ')}
                                  </td>
                                  <td className="px-4 py-2.5 font-semibold text-slate-800">
                                    {v}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {sentences.length > 0 && (
                      <div>
                        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
                          Example sentences
                        </h3>
                        <ul className="space-y-3">
                          {sentences.map((s, i) => (
                            <li
                              key={i}
                              className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3"
                            >
                              <p className="font-medium text-slate-900">{s.norwegian}</p>
                              <p className="mt-1 text-sm text-slate-600">{s.english}</p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {result.nuances && (
                      <div className="inline-flex items-start gap-2 rounded-full bg-amber-100 px-4 py-2 text-sm text-amber-800">
                        <span className="font-semibold">Nuances:</span>
                        <span>{result.nuances}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-4 pt-2">
                      <button
                        onClick={handleSave}
                        className="rounded-xl bg-emerald-600 px-5 py-2.5 font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                      >
                        Save Flashcard
                      </button>
                      {savedMessage && (
                        <span
                          className={`text-sm font-medium ${
                            savedMessage.startsWith('Could not')
                              ? 'text-rose-600'
                              : 'text-emerald-600'
                          }`}
                        >
                          {savedMessage}
                        </span>
                      )}
                    </div>
                  </article>
                )}

                {!result && !loading && !error && (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 px-6 py-16 text-center text-slate-500">
                    Search for a Norwegian word to see its meaning, forms, and examples.
                  </div>
                )}
              </section>
            )}

            {tab === 'flashcards' && (
              <section>
                {safeCards.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 px-6 py-16 text-center text-slate-500">
                    You have no flashcards yet. Look up a word in the Dictionary tab and
                    save it to build your deck.
                  </div>
                )}

                {safeCards.length > 0 && (
                  <FlashcardView
                    card={safeCards[cardIndex]}
                    index={cardIndex}
                    total={safeCards.length}
                    onNext={() => setCardIndex((i) => Math.min(i + 1, safeCards.length - 1))}
                    onPrev={() => setCardIndex((i) => Math.max(i - 1, 0))}
                    onDelete={handleDeleteCard}
                  />
                )}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  )
}
