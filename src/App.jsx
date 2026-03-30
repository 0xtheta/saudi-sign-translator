import { useState, useCallback } from 'react'
import { Scene } from './components/Scene'
import { Interface } from './components/Interface'
import { AdminApp } from './components/admin/AdminApp'

function App() {
  const isAdminRoute = window.location.pathname.startsWith('/admin')
  const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  const [playbackRequest, setPlaybackRequest] = useState(null)
  const [lookupState, setLookupState] = useState({ status: 'idle', match: null })

  // Handle message submission
  const handleSend = useCallback(async (message) => {
    const trimmed = message.trim()
    if (!trimmed) {
      return
    }

    setLookupState({ status: 'loading', match: null })

    try {
      const response = await fetch(`/api/lookup?query=${encodeURIComponent(trimmed)}`)
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Lookup failed')
      }

      if (payload.match?.animation?.file_url) {
        setPlaybackRequest({
          key: crypto.randomUUID(),
          url: payload.match.animation.file_url,
          title: payload.match.animation.title_ar,
        })
        setLookupState({ status: 'matched', match: payload.match })
      } else {
        setLookupState({ status: 'not_found', match: null })
      }
    } catch (error) {
      console.error(error)
      setLookupState({ status: 'error', match: null })
    }
  }, [])

  if (isAdminRoute) {
    if (!isLocalHost) {
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
      <Interface onSend={handleSend} lookupState={lookupState} />
    </div>
  )
}

export default App
