import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { useGLTF, Environment } from '@react-three/drei'
import * as THREE from 'three'

function SceneWithCamera({ speed = 1 }) {
  const { scene, cameras, animations } = useGLTF('/VAWT2.glb')
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
    <div style={{ width: '100vw', height: '100vh', background: 'white' }}>
      <Canvas gl={{ alpha: true, toneMappingExposure: 1.5 }}>
        {/* ☀️ Matahari */}
        <directionalLight position={[10, 15, 10]} intensity={2.5} castShadow />

        {/* 🌤️ Cahaya lembut */}
        <ambientLight intensity={1.2} />

        <Environment preset="sunset" background={false} />

        {/* 🎛️ Ubah kecepatan di sini */}
        <SceneWithCamera speed={0.3} /> 
      </Canvas>
    </div>
  )
}

export default App
