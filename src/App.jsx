import { useState, useCallback, useEffect } from 'react'
import { Scene } from './components/Scene'
import { Interface } from './components/Interface'
import { AdminApp } from './components/admin/AdminApp'

const NO_MATCH_ANIMATION_URL = '/animations/M_Standing_Idle_001_HeadShake.glb'

function createPlaybackKey() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }

  return `playback-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function PhraseRail({ phrasesState, onSelectPhrase, disabled }) {
  const phrases = phrasesState?.items ?? []

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-10 px-3 sm:px-6 md:px-8"
      style={{ paddingTop: '0.2rem' }}
    >
      <div className="mx-auto flex w-full justify-center">
        <div
          dir="rtl"
          className="pointer-events-auto w-full max-w-3xl overflow-hidden rounded-[1.7rem] border border-white/10 bg-[linear-gradient(180deg,rgba(47,52,58,0.76),rgba(23,26,31,0.84))] px-4 text-center shadow-[0_28px_60px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl sm:rounded-[1.9rem] sm:px-6"
          style={{ paddingTop: '1rem', paddingBottom: '1rem' }}
        >
          <div
            className="flex items-center justify-center gap-3 text-center"
            style={{ marginBottom: '0.875rem' }}
          >
            <span className="hidden h-px w-10 bg-white/12 sm:block" />
            <p className="text-[0.84rem] font-semibold tracking-[0.24em] text-white/50 sm:text-[0.78rem]">
              كلمات سريعة
            </p>
            <span className="hidden h-px w-10 bg-white/12 sm:block" />
          </div>

          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 hidden w-12 bg-gradient-to-r from-[rgba(27,30,35,0.9)] to-transparent sm:block" />
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 hidden w-12 bg-gradient-to-l from-[rgba(27,30,35,0.9)] to-transparent sm:block" />
            <div className="flex items-center justify-start gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {phrasesState?.status === 'loading' ? (
                <span className="shrink-0 px-4 text-sm text-white/40">جارٍ تحميل الكلمات...</span>
              ) : null}

              {phrasesState?.status === 'error' ? (
                <span className="shrink-0 px-4 text-sm text-white/40">تعذر تحميل الكلمات المتاحة</span>
              ) : null}

              {phrases.map((phrase) => (
                <button
                  key={phrase.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelectPhrase?.(phrase.text_original)}
                  className={`
                    shrink-0 rounded-[1.2rem] border px-5 py-3.5 text-[0.98rem] font-medium transition-all duration-200 sm:rounded-[1.2rem] sm:px-5 sm:py-3.5 sm:text-[0.98rem]
                    ${disabled
                      ? 'border-white/10 bg-white/5 text-white/25'
                      : 'border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.035))] text-white/88 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:-translate-y-0.5 hover:border-white/20 hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.14),rgba(255,255,255,0.06))] hover:text-white'
                    }
                  `}
                >
                  {phrase.text_original}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function App() {
  const isAdminRoute = window.location.pathname.startsWith('/admin')
  const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  const adminLocalOnly = String(import.meta.env.VITE_ADMIN_LOCAL_ONLY || 'false').toLowerCase() === 'true'
  const [playbackRequest, setPlaybackRequest] = useState(null)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [lastPlayableMatch, setLastPlayableMatch] = useState(null)
  const [lookupState, setLookupState] = useState({
    status: 'idle',
    match: null,
    transcript: '',
    error: '',
  })
  const [phrasesState, setPhrasesState] = useState({
    status: 'loading',
    items: [],
  })

  const applyLookupResult = useCallback((match, extras = {}) => {
    if (match?.animation?.file_url) {
      setLastPlayableMatch(match)
      setPlaybackRequest({
        key: createPlaybackKey(),
        url: match.animation.file_url,
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
    setPlaybackRequest({
      key: createPlaybackKey(),
      url: NO_MATCH_ANIMATION_URL,
    })
  }, [])

  const handleReplay = useCallback(() => {
    if (!lastPlayableMatch?.animation?.file_url) {
      return
    }

    setPlaybackRequest({
      key: createPlaybackKey(),
      url: lastPlayableMatch.animation.file_url,
    })
  }, [lastPlayableMatch])

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

  useEffect(() => {
    const abortController = new AbortController()

    const loadPhrases = async () => {
      try {
        const response = await fetch('/api/phrases?limit=60', { signal: abortController.signal })
        const payload = await response.json()

        if (!response.ok) {
          throw new Error(payload.error || 'Failed to load phrases')
        }

        setPhrasesState({
          status: 'ready',
          items: payload.phrases ?? [],
        })
      } catch (error) {
        if (error.name === 'AbortError') {
          return
        }

        console.error(error)
        setPhrasesState({ status: 'error', items: [] })
      }
    }

    void loadPhrases()

    return () => abortController.abort()
  }, [])

  if (isAdminRoute) {
    if (adminLocalOnly && !isLocalHost) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#0a0a0b] px-6 text-white">
          <div className="max-w-md rounded-[1.75rem] border border-white/10 bg-white/5 p-8 text-center">
            <h1 className="text-2xl font-semibold">لوحة الإدارة غير متاحة</h1>
            <p className="mt-3 text-sm leading-6 text-white/55">
              لوحة الإدارة متاحة فقط على الجهاز المحلي.
            </p>
          </div>
        </div>
      )
    }

    return <AdminApp />
  }

  return (
    <div className="relative w-full h-full overflow-hidden">
      <Scene playbackRequest={playbackRequest} playbackSpeed={playbackSpeed} />
      <PhraseRail
        phrasesState={phrasesState}
        onSelectPhrase={handleSend}
        disabled={lookupState?.status === 'loading' || lookupState?.status === 'transcribing'}
      />
      <Interface
        onSend={handleSend}
        onTranscribe={handleTranscribe}
        onSpeechError={handleSpeechError}
        onReplay={handleReplay}
        canReplay={Boolean(lastPlayableMatch?.animation?.file_url)}
        lookupState={lookupState}
        playbackSpeed={playbackSpeed}
        onPlaybackSpeedChange={setPlaybackSpeed}
      />
    </div>
  )
}

export default App
