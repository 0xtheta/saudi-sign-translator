import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Mic, MicOff } from 'lucide-react'

export function Interface({ onSend, lookupState }) {
  void motion
  const [message, setMessage] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [keyboardHeight, setKeyboardHeight] = useState(0)

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

  const handleSubmit = (e) => {
    e.preventDefault()
    if (message.trim()) {
      onSend?.(message)
      setMessage('')
    }
  }

  const toggleListening = () => {
    setIsListening(!isListening)
  }

  const isKeyboardOpen = isMobile && keyboardHeight > 0

  return (
    <div
      className="fixed z-10 pointer-events-none inset-x-0 p-4 sm:p-6 md:p-8 flex justify-center"
      style={{
        bottom: isKeyboardOpen ? `${keyboardHeight + 10}px` : 0,
        transition: 'bottom 0.15s ease-out',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="w-full max-w-4xl relative z-10"
      >
        <form onSubmit={handleSubmit} className="pointer-events-auto w-full">
          <motion.div
            layout
            className={`
              glass rounded-3xl p-4 sm:p-6 flex flex-col gap-4
              transition-shadow duration-300 ease-out
              ${isFocused ? 'shadow-[0_0_50px_rgba(99,102,241,0.2)]' : ''}
            `}
            animate={{
              borderColor: isFocused ? 'rgba(99, 102, 241, 0.3)' : 'rgba(255, 255, 255, 0.12)',
            }}
          >
            <textarea
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
              placeholder="Ask me anything..."
              rows={isKeyboardOpen ? 2 : 4}
              className="
                bg-transparent border-none outline-none resize-none
                text-white placeholder-white/40
                px-4 py-4 text-lg sm:text-xl
                font-normal tracking-wide
              "
            />

            <div className="flex items-center justify-between border-t border-white/10 pt-4">
              <p className="text-white/30 text-sm tracking-wide hidden sm:block">
                {lookupState?.status === 'loading'
                  ? 'Looking for a matching sign...'
                  : lookupState?.status === 'matched'
                    ? `Matched: ${lookupState.match?.animation?.title_ar ?? 'animation'}`
                    : lookupState?.status === 'not_found'
                      ? 'No matching sign found in the local database'
                      : 'Press Enter to send • Shift+Enter for new line'}
              </p>

              <div className="flex items-center gap-3 ml-auto">
                <motion.button
                  type="button"
                  onClick={toggleListening}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`
                    p-4 rounded-2xl transition-all duration-200
                    ${isListening
                      ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                      : 'hover:bg-white/10 text-white/60 hover:text-white/90'
                    }
                  `}
                >
                  <AnimatePresence mode="wait">
                    {isListening ? (
                      <motion.div
                        key="listening"
                        initial={{ scale: 0, rotate: -90 }}
                        animate={{ scale: 1, rotate: 0 }}
                        exit={{ scale: 0, rotate: 90 }}
                        transition={{ duration: 0.2 }}
                      >
                        <MicOff className="w-6 h-6" />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="idle"
                        initial={{ scale: 0, rotate: 90 }}
                        animate={{ scale: 1, rotate: 0 }}
                        exit={{ scale: 0, rotate: -90 }}
                        transition={{ duration: 0.2 }}
                      >
                        <Mic className="w-6 h-6" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.button>

                <motion.button
                  type="submit"
                  disabled={!message.trim()}
                  whileHover={{ scale: message.trim() ? 1.05 : 1 }}
                  whileTap={{ scale: message.trim() ? 0.95 : 1 }}
                  className={`
                    p-4 rounded-2xl transition-all duration-200
                    ${message.trim()
                      ? 'bg-[#6366f1] text-white hover:bg-[#5457e5] shadow-lg shadow-[#6366f1]/25'
                      : 'bg-white/5 text-white/30 cursor-not-allowed'
                    }
                  `}
                >
                  <Send className="w-6 h-6" />
                </motion.button>
              </div>
            </div>
          </motion.div>
        </form>
      </motion.div>

      <AnimatePresence>
        {isListening && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          >
            <div className="flex items-center gap-3 glass rounded-full px-6 py-3">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.div
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
