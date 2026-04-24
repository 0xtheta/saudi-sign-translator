import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Mic, Radio, RotateCcw } from 'lucide-react'

const MotionDiv = motion.div
const MotionButton = motion.button

const MIME_TYPE_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
]

function pickRecordingMimeType() {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return ''
  }

  return MIME_TYPE_CANDIDATES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? ''
}

function getRecordingFilename(mimeType) {
  if (mimeType.includes('mp4')) {
    return 'speech.m4a'
  }

  if (mimeType.includes('ogg')) {
    return 'speech.ogg'
  }

  return 'speech.webm'
}

export function Interface({
  onSend,
  onTranscribe,
  onSpeechError,
  onReplay,
  canReplay,
  lookupState,
  phrasesState,
  onSelectPhrase,
  playbackSpeed,
  onPlaybackSpeedChange,
}) {
  const [message, setMessage] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const mediaRecorderRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const audioChunksRef = useRef([])

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window)
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)

    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) {
      return undefined
    }

    const handleViewport = () => {
      const keyboardH = window.innerHeight - viewport.height
      setKeyboardHeight(keyboardH > 50 ? keyboardH : 0)

      if (viewport.offsetTop > 0) {
        window.scrollTo(0, 0)
      }
    }

    viewport.addEventListener('resize', handleViewport)
    viewport.addEventListener('scroll', handleViewport)

    return () => {
      viewport.removeEventListener('resize', handleViewport)
      viewport.removeEventListener('scroll', handleViewport)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (message.trim()) {
      onSend?.(message)
      setMessage('')
    }
  }

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }
  }

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      onSpeechError?.('تسجيل الصوت غير مدعوم في هذا المتصفح')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = pickRecordingMimeType()
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)

      mediaStreamRef.current = stream
      mediaRecorderRef.current = recorder
      audioChunksRef.current = []

      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      })

      recorder.addEventListener('stop', async () => {
        const blobType = recorder.mimeType || mimeType || 'audio/webm'
        const audioBlob = new Blob(audioChunksRef.current, { type: blobType })

        audioChunksRef.current = []
        mediaRecorderRef.current = null
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
        mediaStreamRef.current = null
        setIsListening(false)

        if (audioBlob.size > 0) {
          await onTranscribe?.(audioBlob, getRecordingFilename(blobType))
        }
      })

      recorder.start()
      setIsListening(true)
    } catch (error) {
      console.error(error)
      onSpeechError?.('تم رفض إذن استخدام الميكروفون')
    }
  }

  const toggleListening = () => {
    if (isListening) {
      stopRecording()
      return
    }

    void startRecording()
  }

  const isKeyboardOpen = isMobile && keyboardHeight > 0
  const isBusy = lookupState?.status === 'loading' || lookupState?.status === 'transcribing'
  const phrases = phrasesState?.items ?? []
  const textareaPlaceholder =
    lookupState?.status === 'matched' && lookupState?.transcript
      ? `تم التقاط: ${lookupState.transcript}`
      : lookupState?.status === 'not_found' && lookupState?.transcript
        ? `تم التقاط: ${lookupState.transcript} • لم يتم العثور على تطابق`
        : lookupState?.status === 'not_found'
          ? 'لم يتم العثور على تطابق'
          : 'اكتب كلمة أو عبارة'

  return (
    <div
      className="fixed z-10 pointer-events-none inset-x-0 px-3 pb-3 pt-4 sm:p-6 md:p-8 flex justify-center"
      style={{
        bottom: isKeyboardOpen ? `${keyboardHeight + 10}px` : 0,
        transition: 'bottom 0.15s ease-out',
      }}
    >
      <MotionDiv
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-4xl"
      >
        <form onSubmit={handleSubmit} className="pointer-events-auto w-full">
          <MotionDiv
            layout
            className={`
              glass rounded-[1.9rem] p-4 sm:p-5 flex flex-col gap-4
              transition-shadow duration-300 ease-out
              ${isFocused ? 'shadow-[0_0_50px_rgba(99,102,241,0.2)]' : ''}
            `}
            animate={{
              borderColor: isFocused ? 'rgba(99, 102, 241, 0.3)' : 'rgba(255, 255, 255, 0.12)',
            }}
          >
            <textarea
              dir="rtl"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onFocus={() => {
                setIsFocused(true)
                setTimeout(() => {
                  window.scrollTo(0, 0)
                  document.body.scrollTop = 0
                  document.documentElement.scrollTop = 0
                }, 100)
              }}
              onBlur={() => setIsFocused(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit(e)
                }
              }}
              placeholder={textareaPlaceholder}
              rows={isKeyboardOpen ? 2 : 4}
              className="
                bg-transparent border-none outline-none resize-none
                text-white placeholder-white/40
                w-full px-2 pt-4 pb-2 text-lg sm:px-3 sm:pt-5 sm:pb-3 sm:text-xl
                text-right font-normal leading-8
              "
            />

            <div
              dir="rtl"
              className="mx-1 overflow-hidden rounded-[1.5rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
            >
              <div className="flex items-stretch gap-3 overflow-x-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {phrasesState?.status === 'loading' ? (
                  <span className="px-3 text-sm text-white/35">جارٍ تحميل الكلمات...</span>
                ) : null}

                {phrasesState?.status === 'error' ? (
                  <span className="px-3 text-sm text-white/35">تعذر تحميل الكلمات المتاحة</span>
                ) : null}

                {phrases.map((phrase) => (
                  <button
                    key={phrase.id}
                    type="button"
                    disabled={isBusy}
                    onClick={() => onSelectPhrase?.(phrase.text_original)}
                    className={`
                      shrink-0 rounded-[1.15rem] border px-4 py-3 text-right transition-all duration-200
                      ${isBusy
                        ? 'border-white/10 bg-white/5 text-white/25'
                        : 'border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] text-white/88 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:-translate-y-0.5 hover:border-white/20 hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.04))] hover:text-white'
                      }
                    `}
                  >
                    <span className="block text-base font-medium leading-6">{phrase.text_original}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <MotionButton
                  type="button"
                  onClick={() => onReplay?.()}
                  disabled={!canReplay || isBusy}
                  whileHover={{ scale: canReplay && !isBusy ? 1.05 : 1 }}
                  whileTap={{ scale: canReplay && !isBusy ? 0.95 : 1 }}
                  className={`
                    inline-flex items-center justify-center p-5 rounded-[1.35rem] transition-all duration-200
                    ${canReplay && !isBusy
                      ? 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/90'
                      : 'bg-white/5 text-white/25 cursor-not-allowed'
                    }
                  `}
                  title="إعادة تشغيل آخر إشارة"
                  aria-label="إعادة تشغيل آخر إشارة"
                >
                  <RotateCcw className="w-7 h-7" />
                </MotionButton>

                <MotionButton
                  type="button"
                  onClick={toggleListening}
                  disabled={lookupState?.status === 'transcribing'}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`
                    inline-flex items-center justify-center p-5 rounded-[1.35rem] transition-all duration-200
                    ${isListening
                      ? 'bg-emerald-500/18 text-emerald-300 ring-1 ring-emerald-400/25 shadow-lg shadow-emerald-500/15'
                      : lookupState?.status === 'transcribing'
                        ? 'bg-white/5 text-white/25 cursor-not-allowed'
                        : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/90'
                    }
                  `}
                >
                  <AnimatePresence mode="wait">
                    {isListening ? (
                      <MotionDiv
                        key="listening"
                        initial={{ scale: 0, rotate: -90 }}
                        animate={{ scale: 1, rotate: 0 }}
                        exit={{ scale: 0, rotate: 90 }}
                        transition={{ duration: 0.2 }}
                      >
                        <Radio className="w-7 h-7" />
                      </MotionDiv>
                    ) : (
                      <MotionDiv
                        key="idle"
                        initial={{ scale: 0, rotate: 90 }}
                        animate={{ scale: 1, rotate: 0 }}
                        exit={{ scale: 0, rotate: -90 }}
                        transition={{ duration: 0.2 }}
                      >
                        <Mic className="w-7 h-7" />
                      </MotionDiv>
                    )}
                  </AnimatePresence>
                </MotionButton>

                <MotionButton
                  type="submit"
                  disabled={!message.trim() || isBusy}
                  whileHover={{ scale: message.trim() && !isBusy ? 1.05 : 1 }}
                  whileTap={{ scale: message.trim() && !isBusy ? 0.95 : 1 }}
                  className={`
                    inline-flex items-center justify-center rounded-[1.35rem] px-5 py-4 transition-all duration-200
                    ${message.trim() && !isBusy
                      ? 'bg-[#6366f1] text-white hover:bg-[#5457e5] shadow-lg shadow-[#6366f1]/25'
                      : 'bg-white/5 text-white/30 cursor-not-allowed'
                    }
                  `}
                >
                  <Send className="w-6 h-6" />
                </MotionButton>
              </div>

              <div className="flex flex-1 justify-center">
                <div className="flex w-[8.25rem] items-center gap-2 sm:w-[9rem]">
                  <span className="shrink-0 text-[0.7rem] text-white/45">السرعة</span>
                  <input
                    type="range"
                    min="0.25"
                    max="1"
                    step="0.05"
                    value={playbackSpeed}
                    onChange={(e) => onPlaybackSpeedChange?.(Number(e.target.value))}
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-white"
                  />
                  <span className="w-7 shrink-0 text-right text-[0.68rem] tabular-nums text-white/55">
                    {playbackSpeed.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}
                  </span>
                </div>
              </div>
              <span className="hidden sm:block" />
            </div>
          </MotionDiv>
        </form>
      </MotionDiv>

      <AnimatePresence>
        {isListening && (
          <MotionDiv
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          >
            <div className="flex items-center gap-3 glass rounded-full px-6 py-3">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <MotionDiv
                    key={i}
                    className="w-2 h-2 bg-red-400 rounded-full"
                    animate={{
                      scale: [1, 1.5, 1],
                      opacity: [0.5, 1, 0.5],
                    }}
                    transition={{
                      duration: 0.8,
                      repeat: Infinity,
                      delay: i * 0.15,
                    }}
                  />
                ))}
              </div>
              <span className="text-white/70 text-sm">Listening...</span>
            </div>
          </MotionDiv>
        )}
      </AnimatePresence>
    </div>
  )
}
