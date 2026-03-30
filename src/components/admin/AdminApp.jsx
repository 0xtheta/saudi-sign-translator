import { useEffect, useMemo, useState } from 'react'
import { Database, Languages, Search, Trash2, Upload } from 'lucide-react'
import {
  createAnimation,
  createPhrase,
  loadAdminState,
  removeAnimation as deleteAnimationRequest,
  removePhrase as deletePhraseRequest,
} from '../../lib/adminApi'
import {
  findBestAnimationMatch,
  normalizeArabicText,
  slugifyLabel,
} from '../../lib/arabic'

function StatCard({ icon: Icon, label, value }) {
  void Icon
  return (
    <div className="admin-stat-card">
      <div className="admin-stat-icon">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="admin-stat-label">{label}</p>
        <p className="admin-stat-value">{value}</p>
      </div>
    </div>
  )
}

export function AdminApp() {
  const [adminState, setAdminState] = useState({ animations: [], phrases: [] })
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [animationForm, setAnimationForm] = useState({
    title_ar: '',
    slug: '',
    notes: '',
  })
  const [animationFile, setAnimationFile] = useState(null)
  const [phraseForm, setPhraseForm] = useState({
    animation_id: '',
    text_original: '',
    priority: 100,
  })
  const [lookupInput, setLookupInput] = useState('')
  const [filterText, setFilterText] = useState('')

  useEffect(() => {
    document.documentElement.classList.add('admin-mode')
    document.body.classList.add('admin-mode')
    document.getElementById('root')?.classList.add('admin-mode')

    return () => {
      document.documentElement.classList.remove('admin-mode')
      document.body.classList.remove('admin-mode')
      document.getElementById('root')?.classList.remove('admin-mode')
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    loadAdminState()
      .then((state) => {
        if (!isMounted) {
          return
        }
        setAdminState({
          animations: state.animations ?? [],
          phrases: state.phrases ?? [],
        })
      })
      .catch((error) => {
        if (isMounted) {
          setErrorMessage(error.message)
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  const filteredAnimations = useMemo(() => {
    const normalizedFilter = normalizeArabicText(filterText)
    if (!normalizedFilter) {
      return adminState.animations
    }

    return adminState.animations.filter((animation) => {
      const titleMatch = normalizeArabicText(animation.title_ar).includes(normalizedFilter)
      const slugMatch = animation.slug.includes(slugifyLabel(filterText))
      return titleMatch || slugMatch
    })
  }, [adminState.animations, filterText])

  const phrasesByAnimationId = useMemo(() => {
    return adminState.phrases.reduce((accumulator, phrase) => {
      accumulator[phrase.animation_id] ??= []
      accumulator[phrase.animation_id].push(phrase)
      return accumulator
    }, {})
  }, [adminState.phrases])

  const lookupResult = useMemo(() => {
    return findBestAnimationMatch(
      lookupInput,
      adminState.animations,
      adminState.phrases
    )
  }, [adminState.animations, adminState.phrases, lookupInput])

  async function addAnimation(event) {
    event.preventDefault()
    setErrorMessage('')

    const title = animationForm.title_ar.trim()
    const slug = slugifyLabel(animationForm.slug || title)
    if (!title || !slug || !animationFile) {
      return
    }

    try {
      const formData = new FormData()
      formData.append('title_ar', title)
      formData.append('slug', slug)
      formData.append('notes', animationForm.notes.trim())
      formData.append('file', animationFile)

      const payload = await createAnimation(formData)
      const animationRecord = payload.animation
      setAdminState((current) => ({
        ...current,
        animations: [animationRecord, ...current.animations],
      }))
      setAnimationForm({
        title_ar: '',
        slug: '',
        notes: '',
      })
      setAnimationFile(null)
      setPhraseForm((current) => ({
        ...current,
        animation_id: current.animation_id || animationRecord.id,
      }))
    } catch (error) {
      setErrorMessage(error.message)
    }
  }

  async function addPhrase(event) {
    event.preventDefault()
    setErrorMessage('')

    const original = phraseForm.text_original.trim()
    if (!phraseForm.animation_id || !original) {
      return
    }

    try {
      const payload = await createPhrase({
        animation_id: phraseForm.animation_id,
        text_original: original,
        priority: Number(phraseForm.priority) || 100,
      })

      setAdminState((current) => ({
        ...current,
        phrases: [payload.phrase, ...current.phrases],
      }))
      setPhraseForm((current) => ({
        ...current,
        text_original: '',
        priority: 100,
      }))
    } catch (error) {
      setErrorMessage(error.message)
    }
  }

  async function removeAnimation(animationId) {
    setErrorMessage('')
    try {
      await deleteAnimationRequest(animationId)
      setAdminState((current) => ({
        animations: current.animations.filter((entry) => entry.id !== animationId),
        phrases: current.phrases.filter((entry) => entry.animation_id !== animationId),
      }))
    } catch (error) {
      setErrorMessage(error.message)
    }
  }

  async function removePhrase(phraseId) {
    setErrorMessage('')
    try {
      await deletePhraseRequest(phraseId)
      setAdminState((current) => ({
        ...current,
        phrases: current.phrases.filter((entry) => entry.id !== phraseId),
      }))
    } catch (error) {
      setErrorMessage(error.message)
    }
  }

  return (
    <div className="admin-shell">
      <div className="admin-shell__grid" />

      <div className="admin-container">
        <header className="admin-topbar">
          <div>
            <p className="admin-kicker">Saudi Sign Translator</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Admin Panel
            </h1>
          </div>

          <div className="admin-topbar__status">
            {isLoading ? 'Loading local backend...' : 'SQLite backend connected'}
          </div>
        </header>

        {errorMessage ? (
          <div className="admin-error-banner">{errorMessage}</div>
        ) : null}

        <section className="grid gap-3 md:grid-cols-3">
          <StatCard icon={Database} label="Animations" value={adminState.animations.length} />
          <StatCard icon={Languages} label="Phrases" value={adminState.phrases.length} />
          <StatCard
            icon={Search}
            label="Normalized Query"
            value={normalizeArabicText(lookupInput) || '—'}
          />
        </section>

        <section className="admin-layout">
          <div className="admin-column">
            <section className="admin-panel">
              <h2 className="admin-panel__title">Create animation</h2>
              <form className="grid gap-3.5" onSubmit={addAnimation}>
                <input
                  value={animationForm.title_ar}
                  onChange={(event) =>
                    setAnimationForm((current) => ({
                      ...current,
                      title_ar: event.target.value,
                    }))
                  }
                  placeholder="Arabic title"
                  className="admin-input"
                />
                <input
                  value={animationForm.slug}
                  onChange={(event) =>
                    setAnimationForm((current) => ({
                      ...current,
                      slug: event.target.value,
                    }))
                  }
                  placeholder="Slug (optional)"
                  className="admin-input"
                />
                <textarea
                  value={animationForm.notes}
                  onChange={(event) =>
                    setAnimationForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  placeholder="Notes"
                  rows={3}
                  className="admin-input resize-none"
                />
                <label className="admin-upload">
                  <input
                    type="file"
                    accept=".glb"
                    className="hidden"
                    onChange={(event) => setAnimationFile(event.target.files?.[0] ?? null)}
                  />
                  <div className="admin-upload__icon">
                    <Upload className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">
                      {animationFile ? animationFile.name : 'Upload animation file'}
                    </p>
                    <p className="mt-1 text-xs text-white/42">
                      GLB only
                    </p>
                  </div>
                </label>
                <div className="admin-inline-note">
                  <span>Slug preview</span>
                  <span>{slugifyLabel(animationForm.slug || animationForm.title_ar) || '—'}</span>
                </div>
                <button type="submit" className="admin-button">
                  Save animation
                </button>
              </form>
            </section>

            <section className="admin-panel">
              <h2 className="admin-panel__title">Map phrase</h2>
              <form className="grid gap-3.5" onSubmit={addPhrase}>
                <select
                  value={phraseForm.animation_id}
                  onChange={(event) =>
                    setPhraseForm((current) => ({
                      ...current,
                      animation_id: event.target.value,
                    }))
                  }
                  className="admin-input"
                >
                  <option value="">Select animation</option>
                  {adminState.animations.map((animation) => (
                    <option key={animation.id} value={animation.id}>
                      {animation.title_ar} ({animation.slug})
                    </option>
                  ))}
                </select>
                <textarea
                  value={phraseForm.text_original}
                  onChange={(event) =>
                    setPhraseForm((current) => ({
                      ...current,
                      text_original: event.target.value,
                    }))
                  }
                  placeholder="Arabic phrase or alias"
                  rows={4}
                  className="admin-input resize-none"
                />
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={phraseForm.priority}
                  onChange={(event) =>
                    setPhraseForm((current) => ({
                      ...current,
                      priority: event.target.value,
                    }))
                  }
                  className="admin-input"
                />
                <div className="admin-inline-note">
                  <span>Normalized</span>
                  <span>{normalizeArabicText(phraseForm.text_original) || '—'}</span>
                </div>
                <button type="submit" className="admin-button admin-button--muted">
                  Save phrase
                </button>
              </form>
            </section>
          </div>

          <div className="admin-column">
            <section className="admin-panel">
              <div className="admin-panel__row">
                <h2 className="admin-panel__title">Lookup tester</h2>
              </div>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                <textarea
                  value={lookupInput}
                  onChange={(event) => setLookupInput(event.target.value)}
                  placeholder="Type an Arabic word or phrase"
                  rows={6}
                  className="admin-input resize-none"
                />
                <div className="admin-result-card">
                  {lookupResult ? (
                    <>
                      <p className="admin-result-label">Matched animation</p>
                      <h3 className="mt-2 text-2xl font-semibold text-white">
                        {lookupResult.animation.title_ar}
                      </h3>
                      <div className="mt-4 grid gap-2 text-sm text-white/56">
                        <p>{lookupResult.phrase.text_original}</p>
                        <p>{lookupResult.animation.file_name}</p>
                        <p>{(lookupResult.score * 100).toFixed(0)}% confidence</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="admin-result-label">Matched animation</p>
                      <h3 className="mt-2 text-2xl font-semibold text-white/38">No match</h3>
                    </>
                  )}
                </div>
              </div>
            </section>

            <section className="admin-panel">
              <div className="admin-panel__row">
                <h2 className="admin-panel__title">Animation library</h2>
                <input
                  value={filterText}
                  onChange={(event) => setFilterText(event.target.value)}
                  placeholder="Filter"
                  className="admin-input admin-input--compact"
                />
              </div>

              <div className="grid gap-4">
                {filteredAnimations.map((animation) => {
                  const linkedPhrases = phrasesByAnimationId[animation.id] ?? []

                  return (
                    <article key={animation.id} className="admin-library-card">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-xl font-semibold text-white">
                              {animation.title_ar}
                            </h3>
                            <span className="admin-slug-chip">{animation.slug}</span>
                          </div>
                          <p className="mt-3 text-sm text-white/42">{animation.file_name}</p>
                          {animation.notes ? (
                            <p className="mt-3 text-sm leading-6 text-white/56">
                              {animation.notes}
                            </p>
                          ) : null}
                        </div>

                        <button
                          type="button"
                          onClick={() => removeAnimation(animation.id)}
                          className="admin-delete-button"
                        >
                          <Trash2 className="h-4 w-4" />
                          Remove
                        </button>
                      </div>

                      <div className="mt-4 grid gap-2">
                        {linkedPhrases.length ? (
                          linkedPhrases.map((phrase) => (
                            <div key={phrase.id} className="admin-phrase-row">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-white/88">
                                  {phrase.text_original}
                                </p>
                                <p className="mt-1 text-xs text-white/38">
                                  {phrase.text_normalized} · priority {phrase.priority}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => removePhrase(phrase.id)}
                                className="admin-delete-button admin-delete-button--small"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-[1rem] border border-dashed border-white/8 px-4 py-4 text-sm text-white/34">
                            No phrases mapped yet.
                          </div>
                        )}
                      </div>
                    </article>
                  )
                })}

                {!filteredAnimations.length ? (
                  <div className="rounded-[1.2rem] border border-dashed border-white/8 px-4 py-8 text-center text-sm text-white/34">
                    No animation records yet.
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        </section>
      </div>
    </div>
  )
}
