import { useState, useCallback } from 'react'
import { Scene } from './components/Scene'
import { Interface } from './components/Interface'
import { AdminApp } from './components/admin/AdminApp'

function createPlaybackKey() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }

  return `playback-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function App() {
  const isAdminRoute = window.location.pathname.startsWith('/admin')
  const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  const adminLocalOnly = String(import.meta.env.VITE_ADMIN_LOCAL_ONLY || 'false').toLowerCase() === 'true'
  const [playbackRequest, setPlaybackRequest] = useState(null)
  const [lookupState, setLookupState] = useState({
    status: 'idle',
    match: null,
    transcript: '',
    error: '',
  })

  const applyLookupResult = useCallback((match, extras = {}) => {
    if (match?.animation?.file_url) {
      setPlaybackRequest({
        key: createPlaybackKey(),
        url: match.animation.file_url,
        title: match.animation.title_ar,
      })
      setLookupState({
        status: 'matched',
        match,
        transcript: extras.transcript ?? '',
        error: '',
      })
      return
    }

    setLookupState({
      status: 'not_found',
      match: null,
      transcript: extras.transcript ?? '',
      error: '',
    })
  }, [])

  // Handle message submission
  const handleSend = useCallback(async (message) => {
    const trimmed = message.trim()
    if (!trimmed) {
      return
    }

    setLookupState({ status: 'loading', match: null, transcript: '', error: '' })

    try {
      const response = await fetch(`/api/lookup?query=${encodeURIComponent(trimmed)}`)
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Lookup failed')
      }

      applyLookupResult(payload.match)
    } catch (error) {
      console.error(error)
      setLookupState({
        status: 'error',
        match: null,
        transcript: '',
        error: error.message || 'Lookup failed',
      })
    }
  }, [applyLookupResult])

  const handleTranscribe = useCallback(async (audioBlob, filename) => {
    setLookupState({ status: 'transcribing', match: null, transcript: '', error: '' })

    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, filename)

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Transcription failed')
      }

      applyLookupResult(payload.match, { transcript: payload.transcript ?? '' })
    } catch (error) {
      console.error(error)
      setLookupState({
        status: 'error',
        match: null,
        transcript: '',
        error: error.message || 'Transcription failed',
      })
    }
  }, [applyLookupResult])

  const handleSpeechError = useCallback((message) => {
    setLookupState({
      status: 'error',
      match: null,
      transcript: '',
      error: message,
    })
  }, [])

  if (isAdminRoute) {
    if (adminLocalOnly && !isLocalHost) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#0a0a0b] px-6 text-white">
          <div className="max-w-md rounded-[1.75rem] border border-white/10 bg-white/5 p-8 text-center">
            <h1 className="text-2xl font-semibold">Admin unavailable</h1>
            <p className="mt-3 text-sm leading-6 text-white/55">
              The admin panel is restricted to localhost.
            </p>
          </div>
        </div>
      )
    }

    return <AdminApp />
  }

  return (
    <div className="relative w-full h-full overflow-hidden">
      <Scene playbackRequest={playbackRequest} />
      <Interface
        onSend={handleSend}
        onTranscribe={handleTranscribe}
        onSpeechError={handleSpeechError}
        lookupState={lookupState}
      />
    </div>
  )
}

export default App
