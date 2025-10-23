import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { useEffect, useRef, Suspense } from 'react'
import { useGLTF, Environment, OrbitControls, Html, useProgress } from '@react-three/drei'
import * as THREE from 'three'

// 🌀 Komponen loader visual
function Loader() {
  const { progress } = useProgress()
  return (
    <Html center>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#444',
          background: 'rgba(255,255,255,0.8)',
          padding: '20px 30px',
          borderRadius: '12px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            width: '120px',
            height: '6px',
            background: '#eee',
            borderRadius: '3px',
            overflow: 'hidden',
            marginBottom: '10px',
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: '100%',
              background: '#3b82f6',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
        <p style={{ fontSize: '14px', margin: 0 }}>{progress.toFixed(0)}% Loading</p>
      </div>
    </Html>
  )
}

// 🌍 Scene utama
function SceneWithCamera({ speed = 1, autoRotateSpeed = 0.2 }) {
  const { scene, cameras, animations } = useGLTF('/8hres.glb')
  const { set } = useThree()
  const mixer = useRef(null)
  const cameraRef = useRef(null)
  const groupRef = useRef(null)
  const controlsRef = useRef(null)

  useEffect(() => {
    // 🎥 Gunakan kamera dari Blender jika tersedia
    if (cameras && cameras.length > 0) {
      const blenderCamera = cameras[0]
      cameraRef.current = blenderCamera
      set({ camera: blenderCamera })
    }

    // 🎞️ Jalankan animasi jika ada
    if (animations && animations.length > 0) {
      mixer.current = new THREE.AnimationMixer(scene)
      animations.forEach((clip) => mixer.current.clipAction(clip).play())
      mixer.current.timeScale = speed
    }

    // 🎯 Hitung bounding box & auto-center kamera
    const box = new THREE.Box3().setFromObject(scene)
    const center = new THREE.Vector3()
    box.getCenter(center)
    scene.position.sub(center)

    // Set OrbitControls agar target ke tengah model
    if (controlsRef.current) {
      controlsRef.current.target.copy(new THREE.Vector3(0, 0, 0))
      controlsRef.current.update()
    }

    // Arahkan kamera ke tengah model
    if (cameraRef.current) {
      cameraRef.current.lookAt(0, 0, 0)
    }
  }, [cameras, animations, scene, set, speed])

  // 🔁 Auto rotate lembut
  useFrame((_, delta) => {
    if (mixer.current) mixer.current.update(delta)
    if (groupRef.current) groupRef.current.rotation.y += autoRotateSpeed * delta
  })

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      <primitive object={scene} />
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.05}
        enableZoom={true}
        enablePan={false}
        rotateSpeed={0.8}
        zoomSpeed={0.8}
      />
    </group>
  )
}

// 🧩 Main App
export default function App() {
  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: 'transparent',
        overflow: 'hidden',
      }}
    >
      <Canvas
        gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
        style={{ background: 'transparent' }}
        camera={{ position: [0, 2, 5], fov: 50 }}
      >
        {/* ⬇️ Tambahkan ini agar background benar-benar transparan */}
        <color attach="background" args={['transparent']} />

        <Suspense fallback={<Loader />}>
          <directionalLight position={[10, 150, 10]} intensity={0.6} castShadow />
          <ambientLight intensity={0.3} />
          <Environment preset="sunset" background={false} />
          <SceneWithCamera speed={1} autoRotateSpeed={0.4} />
        </Suspense>
      </Canvas>
    </div>
  )
}
