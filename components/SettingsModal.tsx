'use client'

import React, { useState, useEffect } from 'react'
import { useProfile } from '@/components/ProfileProvider'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
}

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const profileContext = useProfile()
  const activeProfile = profileContext?.activeProfile ?? ''
  const getApiKey = profileContext?.getApiKey
  const setApiKey = profileContext?.setApiKey

  const [keyInput, setKeyInput] = useState('')

  useEffect(() => {
    if (open && activeProfile && getApiKey) {
      try {
        const savedKey = getApiKey(activeProfile) || ''
        setKeyInput(savedKey)
      } catch (err) {
        console.error('Error loading API key:', err)
      }
    }
  }, [open, activeProfile])

  if (!open) return null

  function handleSave() {
    if (activeProfile && setApiKey) {
      try {
        setApiKey(activeProfile, keyInput.trim())
      } catch (err) {
        console.error('Error saving API key:', err)
      }
    }
    onClose()
  }

  function handleRemove() {
    if (activeProfile && setApiKey) {
      try {
        setApiKey(activeProfile, '')
        setKeyInput('')
      } catch (err) {
        console.error('Error removing API key:', err)
      }
    }
    onClose()
  }

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
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
            {activeProfile ? (
              <>This key is saved for the &quot;{activeProfile}&quot; profile and stored only in this browser.</>
            ) : (
              <>Select or create a profile first to save an API key.</>
            )}
            {' '}Get a key from{' '}
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
            disabled={!activeProfile}
            className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
          >
            Save key
          </button>
          
          {keyInput && (
            <button
              onClick={handleRemove}
              disabled={!activeProfile}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
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
