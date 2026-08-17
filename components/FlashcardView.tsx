'use client'

import { useState } from 'react'
import type { Flashcard } from '@/lib/types'

type Props = {
  card: Flashcard
  index: number
  total: number
  onNext: () => void
  onPrev: () => void
  onDelete: (id: string) => void
}

export default function FlashcardView({
  card,
  index,
  total,
  onNext,
  onPrev,
  onDelete,
}: Props) {
  const [flipped, setFlipped] = useState(false)

  const forms = card.forms ?? {}
  const formEntries = Object.entries(forms).filter(([, v]) => v)

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-sm font-medium text-slate-500">
        Card {index + 1} of {total}
      </div>

      <div
        className="group h-80 w-full max-w-md cursor-pointer [perspective:1200px]"
        onClick={() => setFlipped((f) => !f)}
      >
        <div
          className={`relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d] ${
            flipped ? '[transform:rotateY(180deg)]' : ''
          }`}
        >
          {/* Front */}
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-8 shadow-lg [backface-visibility:hidden]">
            <span className="mb-2 text-xs font-semibold uppercase tracking-widest text-sky-600">
              Norwegian
            </span>
            <h2 className="text-center text-4xl font-bold text-slate-900">
              {card.norwegian_word}
            </h2>
            <p className="mt-4 text-sm text-slate-400">Click to flip</p>
          </div>

          {/* Back */}
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-sky-200 bg-sky-50 p-8 shadow-lg [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <span className="mb-2 text-xs font-semibold uppercase tracking-widest text-sky-700">
              English
            </span>
            <h2 className="text-center text-3xl font-bold text-slate-900">
              {card.english_meaning}
            </h2>
            {formEntries.length > 0 && (
              <div className="mt-5 w-full">
                <table className="w-full text-sm">
                  <tbody>
                    {formEntries.map(([k, v]) => (
                      <tr key={k} className="border-b border-sky-100 last:border-0">
                        <td className="py-1.5 pr-4 font-medium capitalize text-slate-500">
                          {k}
                        </td>
                        <td className="py-1.5 text-right font-semibold text-slate-800">
                          {v}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {card.nuances && (
        <div className="w-full max-w-md rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-semibold">Nuances: </span>
          {card.nuances}
        </div>
      )}

      <div className="flex w-full max-w-md items-center justify-between gap-4">
        <button
          onClick={onPrev}
          disabled={index === 0}
          className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>
        <button
          onClick={() => setFlipped((f) => !f)}
          className="rounded-lg bg-sky-600 px-4 py-2.5 font-medium text-white transition hover:bg-sky-700"
        >
          Flip
        </button>
        <button
          onClick={onNext}
          disabled={index === total - 1}
          className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>

      <button
        onClick={() => onDelete(card.id)}
        className="text-sm font-medium text-rose-500 transition hover:text-rose-700"
      >
        Delete this card
      </button>
    </div>
  )
}
