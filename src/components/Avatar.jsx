import { useRef, useEffect, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import * as THREE from 'three'

const AVATAR_URL = '/avatar/avatar.glb'
const IDLE_URL = '/animations/M_Standing_Idle_001.glb'
const ENTER_TRANSITION_DURATION = 0.2
const RETURN_TRANSITION_DURATION = 0.45

function buildIdleClip(clip) {
  if (!clip) {
    return null
  }

  const filteredTracks = clip.tracks.filter((track) => track.name !== 'Hips.position')
  if (!filteredTracks.length) {
    return null
  }

  return new THREE.AnimationClip('idle', clip.duration, filteredTracks.map((track) => track.clone()))
}

export function Avatar({ playbackRequest, playbackSpeed = 1 }) {
  const { size } = useThree()
  const group = useRef()
  const [avatarScene, setAvatarScene] = useState(null)
  const mixerRef = useRef(null)
  const idleActionRef = useRef(null)
  const activeActionRef = useRef(null)
  const endingBlendStartedRef = useRef(false)
  const playbackSpeedRef = useRef(playbackSpeed)
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

    const mixer = new THREE.AnimationMixer(avatarScene)
    mixerRef.current = mixer
    const loader = new GLTFLoader()
    let isMounted = true

    const handleFinished = (event) => {
      const finishedAction = event.action

      if (finishedAction !== activeActionRef.current) {
        finishedAction?.stop()
        return
      }

      activeActionRef.current = null
      endingBlendStartedRef.current = false

      if (idleActionRef.current) {
        idleActionRef.current.enabled = true
        idleActionRef.current.play()
        idleActionRef.current.setEffectiveTimeScale(1)
        idleActionRef.current.setEffectiveWeight(1)
      }

      if (finishedAction) {
        window.setTimeout(() => {
          finishedAction.stop()
        }, RETURN_TRANSITION_DURATION * 1000 + 20)
      }
    }

    mixer.addEventListener('finished', handleFinished)

    loader.load(
      IDLE_URL,
      (gltf) => {
        if (!isMounted || !mixerRef.current || !gltf.animations?.length) {
          return
        }

        const idleClip = buildIdleClip(gltf.animations[0])
        if (!idleClip) {
          console.warn('Idle animation has no usable tracks')
          return
        }

        const idleAction = mixer.clipAction(idleClip)
        idleAction.setLoop(THREE.LoopRepeat, Infinity)
        idleAction.clampWhenFinished = false
        idleAction.enabled = true
        idleAction.setEffectiveWeight(1)
        idleAction.play()
        idleActionRef.current = idleAction
      },
      undefined,
      (error) => {
        console.error('Error loading idle clip:', error)
      }
    )

    return () => {
      isMounted = false
      activeActionRef.current?.stop()
      idleActionRef.current?.stop()
      idleActionRef.current = null
      mixer.removeEventListener('finished', handleFinished)
      mixer.stopAllAction()
      mixerRef.current = null
    }
  }, [avatarScene])

  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed

    if (!activeActionRef.current) {
      return
    }

    activeActionRef.current.setEffectiveTimeScale(playbackSpeed)
  }, [playbackSpeed])

  useEffect(() => {
    if (!avatarScene || !mixerRef.current) {
      return undefined
    }

    if (!playbackRequest?.url) {
      return undefined
    }

    const loader = new GLTFLoader()
    let isMounted = true
    endingBlendStartedRef.current = false

    loader.load(
      playbackRequest.url,
      (gltf) => {
        if (!isMounted || !gltf.animations?.length || !mixerRef.current) {
          return
        }

        const clip = gltf.animations[0]
        const idleAction = idleActionRef.current
        const action = mixerRef.current.clipAction(clip)
        action.reset()
        action.setLoop(THREE.LoopOnce, 1)
        action.clampWhenFinished = true
        action.enabled = true
        action.setEffectiveTimeScale(playbackSpeedRef.current)
        action.setEffectiveWeight(1)
        action.play()

        if (idleAction) {
          idleAction.enabled = true
          idleAction.play()
          idleAction.crossFadeTo(action, ENTER_TRANSITION_DURATION, false)
        } else {
          action.fadeIn(ENTER_TRANSITION_DURATION)
        }

        activeActionRef.current = action
      },
      undefined,
      (error) => {
        console.error('Error loading animation clip:', error)
      }
    )

    return () => {
      isMounted = false
      if (activeActionRef.current) {
        activeActionRef.current.fadeOut(0.1)
        activeActionRef.current = null
        endingBlendStartedRef.current = false
        idleActionRef.current?.setEffectiveWeight(1)
      }
    }
  }, [avatarScene, playbackRequest])

  useFrame((_state, delta) => {
    if (mixerRef.current) {
      mixerRef.current.update(delta)
    }

    const activeAction = activeActionRef.current
    const idleAction = idleActionRef.current
    if (!activeAction || !idleAction || endingBlendStartedRef.current) {
      return
    }

    const remaining = activeAction.getClip().duration - activeAction.time
    if (remaining <= RETURN_TRANSITION_DURATION * playbackSpeed) {
      endingBlendStartedRef.current = true
      idleAction.enabled = true
      idleAction.play()
      idleAction.setEffectiveTimeScale(1)
      idleAction.setEffectiveWeight(1)
      activeAction.crossFadeTo(idleAction, RETURN_TRANSITION_DURATION, false)
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
      rotation={[0, 0, 0]}
    />
  )
}
