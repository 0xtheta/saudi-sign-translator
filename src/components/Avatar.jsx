import { useRef, useEffect, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import * as THREE from 'three'

const AVATAR_URL = '/avatar/694ab0da452afe2bbfaa4e43.glb'
const HEAD_BONE_CANDIDATES = [
  'Head',
  'head',
  'Wolf3D_Head',
  'mixamorigHead',
  'Neck',
  'neck',
]

function findHeadBone(root) {
  const exactMatches = []
  const partialMatches = []

  root.traverse((child) => {
    if (!child.isBone) {
      return
    }

    if (HEAD_BONE_CANDIDATES.includes(child.name)) {
      exactMatches.push(child)
      return
    }

    const normalizedName = child.name.toLowerCase()
    if (normalizedName.includes('head') || normalizedName.includes('neck')) {
      partialMatches.push(child)
    }
  })

  return exactMatches[0] ?? partialMatches[0] ?? null
}

export function Avatar({ mousePosition, animationUrl }) {
  const { size } = useThree()
  const group = useRef()
  const [avatarScene, setAvatarScene] = useState(null)
  const headBone = useRef(null)
  const mixerRef = useRef(null)
  const activeActionRef = useRef(null)
  const targetRotation = useRef({ x: 0, y: 0 })
  const baseRotation = useRef({ x: 0, y: 0 })
  const isMobile = size.width < 640
  const avatarScale = isMobile ? 1.22 : 1.5
  const avatarPositionY = isMobile ? -1.6 : -1.72

  useEffect(() => {
    const loader = new GLTFLoader()
    let isMounted = true

    loader.load(
      AVATAR_URL,
      (gltf) => {
        if (!isMounted) {
          return
        }

        const loadedScene = gltf.scene
        const detectedHeadBone = findHeadBone(loadedScene)

        if (!detectedHeadBone) {
          console.warn('Head bone not found in GLB avatar; mouse tracking will be disabled')
        } else {
          headBone.current = detectedHeadBone
          baseRotation.current = {
            x: detectedHeadBone.rotation.x,
            y: detectedHeadBone.rotation.y,
          }
        }

        loadedScene.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true
            child.receiveShadow = true
            if (child.material) {
              child.material.envMapIntensity = 1.2
            }
          }
        })

        setAvatarScene(loadedScene)
      },
      undefined,
      (error) => {
        console.error('Error loading GLB avatar:', error)
      }
    )

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    const groupNode = group.current

    if (!groupNode || !avatarScene) {
      return
    }

    groupNode.clear()
    groupNode.add(avatarScene)

    return () => {
      groupNode.remove(avatarScene)
    }
  }, [avatarScene])

  useEffect(() => {
    if (!avatarScene) {
      return undefined
    }

    mixerRef.current = mixerRef.current || new THREE.AnimationMixer(avatarScene)

    return () => {
      activeActionRef.current?.stop()
      mixerRef.current?.stopAllAction()
      mixerRef.current = null
    }
  }, [avatarScene])

  useEffect(() => {
    if (!avatarScene || !mixerRef.current) {
      return undefined
    }

    activeActionRef.current?.stop()
    mixerRef.current.stopAllAction()

    if (!animationUrl) {
      return undefined
    }

    const loader = new GLTFLoader()
    let isMounted = true

    loader.load(
      animationUrl,
      (gltf) => {
        if (!isMounted || !gltf.animations?.length || !mixerRef.current) {
          return
        }

        const clip = gltf.animations[0]
        const action = mixerRef.current.clipAction(clip)
        action.reset()
        action.setLoop(THREE.LoopRepeat, Infinity)
        action.clampWhenFinished = false
        action.play()
        activeActionRef.current = action
      },
      undefined,
      (error) => {
        console.error('Error loading animation clip:', error)
      }
    )

    return () => {
      isMounted = false
      activeActionRef.current?.stop()
    }
  }, [animationUrl, avatarScene])

  useFrame((_state, delta) => {
    if (mixerRef.current) {
      mixerRef.current.update(delta)
    }

    if (mousePosition && headBone.current) {
      targetRotation.current.y = THREE.MathUtils.lerp(
        targetRotation.current.y,
        mousePosition.x * 0.25,
        delta * 1.5
      )
      targetRotation.current.x = THREE.MathUtils.lerp(
        targetRotation.current.x,
        -mousePosition.y * 0.12,
        delta * 1.5
      )

      headBone.current.rotation.y = THREE.MathUtils.lerp(
        headBone.current.rotation.y,
        baseRotation.current.y + targetRotation.current.y,
        0.05
      )
      headBone.current.rotation.x = THREE.MathUtils.lerp(
        headBone.current.rotation.x,
        baseRotation.current.x + targetRotation.current.x,
        0.05
      )
    }
  })

  if (!avatarScene) {
    return (
      <group position={[0, -1.5, 0]}>
        <mesh>
          <sphereGeometry args={[0.5, 32, 32]} />
          <meshStandardMaterial color="#6366f1" wireframe />
        </mesh>
      </group>
    )
  }

  return (
    <group
      ref={group}
      position={[0, avatarPositionY, 0]}
      scale={avatarScale}
      rotation={[0, 0.18, 0]}
    />
  )
}
