import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { useGLTF, Environment } from '@react-three/drei'
import * as THREE from 'three'

function SceneWithCamera({ speed = 1 }) {
  const { scene, cameras, animations } = useGLTF('/STS2.glb')
  const { set } = useThree()
  const mixer = useRef(null)

  useEffect(() => {
    // Ganti kamera ke kamera dari Blender
    if (cameras && cameras.length > 0) {
      set({ camera: cameras[0] })
    }

    // Setup animasi
    if (animations && animations.length > 0) {
      mixer.current = new THREE.AnimationMixer(scene)
      animations.forEach((clip) => mixer.current.clipAction(clip).play())
      mixer.current.timeScale = speed // ⚡️ Set kecepatan animasi
    }
  }, [cameras, animations, scene, set, speed])

  // Update animasi tiap frame
  useFrame((_, delta) => {
    if (mixer.current) mixer.current.update(delta)
  })

  return <primitive object={scene} />
}

function App() {
  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: 'transparent', // 🟢 buat background div transparan
      }}
    >
      <Canvas
        gl={{ alpha: true, toneMappingExposure: 1.5 }}
        style={{
          background: 'transparent', // 🟢 buat canvas transparan
        }}
      >
        ☀️ Matahari
        <directionalLight position={[10, 15, 10]} intensity={2.5} castShadow />

        {/* 🌤️ Cahaya lembut */}
        <ambientLight intensity={1.2} />

        {/* Environment tanpa background */}
        <Environment preset="sunset" background={false} />

        {/* 🎛️ Kecepatan animasi */}
        <SceneWithCamera speed={1} />
      </Canvas>
    </div>
  )
}

export default App
