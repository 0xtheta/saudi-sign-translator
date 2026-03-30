import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { Environment, ContactShadows, Float } from '@react-three/drei'
import { Avatar } from './Avatar'

function Lighting() {
  return (
    <>
      {/* Soft ambient fill */}
      <ambientLight intensity={0.4} color="#e0e7ff" />
      
      {/* Main key light from above-front */}
      <spotLight
        position={[2, 5, 4]}
        angle={0.4}
        penumbra={1}
        intensity={1.5}
        color="#f8fafc"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0001}
      />
      
      {/* Rim light from behind for depth */}
      <spotLight
        position={[-3, 3, -3]}
        angle={0.5}
        penumbra={0.8}
        intensity={0.8}
        color="#a5b4fc"
      />
      
      {/* Fill light from the side */}
      <pointLight
        position={[-4, 2, 2]}
        intensity={0.3}
        color="#c7d2fe"
      />
      
      {/* Subtle bottom bounce light */}
      <pointLight
        position={[0, -2, 2]}
        intensity={0.15}
        color="#818cf8"
      />
    </>
  )
}

function LoadingFallback() {
  return (
    <mesh>
      <sphereGeometry args={[0.5, 32, 32]} />
      <meshStandardMaterial color="#6366f1" wireframe />
    </mesh>
  )
}

export function Scene({ mousePosition, animationUrl }) {
  return (
    <Canvas
      shadows
      camera={{ position: [0, 0.5, 3], fov: 45 }}
      gl={{ 
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance'
      }}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'transparent'
      }}
    >
      <Lighting />
      
      {/* Premium environment map for reflections */}
      <Environment preset="city" background={false} />
      
      <Suspense fallback={<LoadingFallback />}>
        <Float
          speed={1.5}
          rotationIntensity={0.1}
          floatIntensity={0.3}
          floatingRange={[-0.05, 0.05]}
        >
          <Avatar mousePosition={mousePosition} animationUrl={animationUrl} />
        </Float>
      </Suspense>
      
      {/* Soft contact shadow beneath avatar */}
      <ContactShadows
        position={[0, -1.5, 0]}
        opacity={0.4}
        scale={10}
        blur={2.5}
        far={4}
        color="#000000"
      />
    </Canvas>
  )
}
