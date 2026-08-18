'use client'

import { useState } from 'react'
import { useProfile } from '@/components/ProfileProvider'

export default function Header() {
  const { activeProfile, selectOrCreateProfile } = useProfile()
  const [isOpen, setIsOpen] = useState(false)
  const [usernameInput, setUsernameInput] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!usernameInput.trim()) return

    setLoading(true)
    try {
      await selectOrCreateProfile(usernameInput.trim())
      setUsernameInput('')
      setIsOpen(false)
    } catch (err) {
      console.error('Failed to select or create profile:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-slate-900">NorskFlash</span>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
          >
            {activeProfile ? (
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {activeProfile.username}
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-600 text-xs text-white">
                  +
                </span>
                Select profile
              </span>
            )}
            <svg
              className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {isOpen && (
            <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl z-50">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                Switch or Create Profile
              </h3>
              
              <form onSubmit={handleProfileSubmit} className="space-y-3">
                <input
                  type="text"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  placeholder="Enter username..."
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={loading || !usernameInput.trim()}
                  className="w-full rounded-xl bg-sky-600 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Continue'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
