'use client'

import React, { useState, useEffect } from 'react'
import { useProfile } from '@/components/ProfileProvider'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
}

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { activeProfile, getApiKey, setApiKey } = useProfile()
  const [keyInput, setKeyInput] = useState('')

  useEffect(() => {
    if (open && activeProfile) {
      setKeyInput(getApiKey(activeProfile) || '')
    }
  }, [open, activeProfile, getApiKey])

  if (!open) return null

  function handleSave() {
    if (activeProfile) {
      setApiKey(activeProfile, keyInput.trim())
    }
    onClose() // Closes modal after saving
  }

  function handleRemove() {
    if (activeProfile) {
      setApiKey(activeProfile, '')
      setKeyInput('')
    }
    onClose() // Closes modal after removing
  }

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Close settings"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h2 className="text-lg font-semibold text-slate-900">Gemini API Key</h2>
        
        <div className="mt-4 space-y-3">
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="Paste your Gemini API key"
            className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
          />
          
          <p className="text-xs text-slate-500">
            This key is saved for the &quot;{activeProfile}&quot; profile and stored only in this browser.
            Get a key from{' '}
            <a
              href="https://aistudio.google.com/"
              target="_blank"
              rel="noreferrer"
              className="text-sky-600 underline hover:text-sky-700"
            >
              Google AI Studio
            </a>
            .
          </p>
        </div>

        <div className="mt-6 flex items-center gap-2">
          <button
            onClick={handleSave}
            className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
          >
            Save key
          </button>
          
          {keyInput && (
            <button
              onClick={handleRemove}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Remove key
            </button>
          )}

          <button
            onClick={onClose}
            className="ml-auto rounded-xl px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}