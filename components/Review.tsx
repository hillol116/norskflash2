'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Rating, type Grade } from 'ts-fsrs'
import { useProfile } from './ProfileProvider'

const grades: { rating: Grade; label: string; hint: string }[] = [
  { rating: Rating.Again, label: 'Again', hint: 'I forgot' },
  { rating: Rating.Hard, label: 'Hard', hint: 'Difficult to recall' },
  { rating: Rating.Good, label: 'Good', hint: 'I remembered' },
  { rating: Rating.Easy, label: 'Easy', hint: 'Effortless' },
]

export default function Review() {
  const { dueCards, loadDueCards, reviewCard } = useProfile()
  const [revealed, setRevealed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const busy = useRef(false)
  const mounted = useRef(true)
  const card = dueCards[0]

  const refresh = useCallback(async () => {
    if (busy.current) return
    try {
      await loadDueCards()
      if (mounted.current) setError('')
    } catch {
      if (mounted.current) setError('Could not load reviews. Check your connection and that the FSRS migration has been applied.')
    } finally { if (mounted.current) setLoading(false) }
  }, [loadDueCards])

  useEffect(() => {
    mounted.current = true
    void refresh()
    const timer = window.setInterval(() => { if (!document.hidden) void refresh() }, 30000)
    window.addEventListener('focus', refresh)
    return () => { mounted.current = false; window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [refresh])
  useEffect(() => { setRevealed(false) }, [card?.id, card?.review_version])

  async function grade(rating: Grade) {
    if (!card || !revealed || busy.current) return
    busy.current = true
    setSaving(true)
    setError('')
    try {
      await reviewCard(card, rating)
      if (mounted.current) setRevealed(false)
      // Refill the bounded due queue, including short learning steps when due.
      await loadDueCards()
    } catch {
      if (mounted.current) setError('Could not complete the review or refresh the queue. Refresh before retrying; a review already saved will not be saved twice.')
    } finally {
      busy.current = false
      if (mounted.current) setSaving(false)
    }
  }

  return <section className="mx-auto max-w-lg space-y-5">
    <div className="flex items-center justify-between">
      <h2 className="text-xl font-bold">Review</h2>
      <button onClick={() => void refresh()} disabled={saving} className="text-sm font-medium text-sky-700">Refresh due cards</button>
    </div>
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-rose-700">{error}</p>}
    {loading ? <p role="status">Loading due cards…</p> : !card ? (
      <div className="rounded-2xl border bg-white p-8 text-center">
        <h3 className="text-xl font-semibold">No cards due right now</h3>
        <p className="mt-2 text-slate-600">Save a word from Dictionary or return when your next review is due. Your deck is in All Cards.</p>
      </div>
    ) : <>
      <p className="text-sm text-slate-500">{dueCards.length === 100 ? '100+' : dueCards.length} due in this queue</p>
      <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-sky-700">Recall the meaning</p>
        <h3 className="break-words text-4xl font-bold">{card.norwegian_word}</h3>
        {!revealed ? <button onClick={() => setRevealed(true)} className="rounded-lg bg-sky-600 px-5 py-3 font-semibold text-white">Show answer</button> : <div className="space-y-4">
          <p className="text-2xl text-sky-800">{card.english_meaning}</p>
          <dl className="space-y-1">{Object.entries(card.forms ?? {}).filter(([, value]) => value).map(([key, value]) =>
            <div key={key}><dt className="inline text-slate-500">{key.replaceAll('_', ' ')}: </dt><dd className="inline font-medium">{value}</dd></div>)}</dl>
          {(card.sentences ?? []).map((sentence, index) => <div key={index}><p>{sentence.norwegian}</p><p className="text-sm text-slate-500">{sentence.english}</p></div>)}
          {card.nuances && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{card.nuances}</p>}
        </div>}
      </div>
      {revealed && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{grades.map(({ rating, label, hint }) =>
        <button key={rating} disabled={saving} onClick={() => void grade(rating)} className="rounded-xl border border-sky-200 bg-white px-3 py-3 hover:bg-sky-50 disabled:opacity-50">
          <span className="block font-semibold">{label}</span><span className="text-xs text-slate-500">{hint}</span>
        </button>)}</div>}
      {saving && <p role="status" className="text-sm text-slate-500">Saving review…</p>}
    </>}
  </section>
}
