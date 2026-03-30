import { useState, useCallback, useEffect } from 'react'
import { Scene } from './components/Scene'
import { Interface } from './components/Interface'

function App() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })

  // Track mouse position for avatar head tracking
  const handleMouseMove = useCallback((e) => {
    const x = (e.clientX / window.innerWidth) * 2 - 1
    const y = (e.clientY / window.innerHeight) * 2 - 1
    setMousePosition({ x, y })
  }, [])

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [handleMouseMove])

  // Handle message submission
  const handleSend = useCallback((message) => {
    console.log('Message sent:', message.trim())
  }, [])

  return (
    <div className="relative w-full h-full overflow-hidden">
      <Scene mousePosition={mousePosition} />
      <Interface onSend={handleSend} />
    </div>
  )
}

export default App
