// src/hres-animate.jsx
import React, { Suspense, useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useGLTF, Environment, OrbitControls, Html, useProgress } from '@react-three/drei'
import * as THREE from 'three'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
gsap.registerPlugin(ScrollTrigger)

/* ---------- Loader ---------- */
function Loader() {
  const { progress } = useProgress()
  return (
    <Html center>
      <div style={{
        padding: 10,
        borderRadius: 8,
        background: 'rgba(0,0,0,0.6)',
        color: 'white'
      }}>
        Loading {Math.round(progress)}%
      </div>
    </Html>
  )
}

/* ---------- Scene component (inside Canvas) ---------- */
function Scene({ modelPath = '/8hres.glb', povs = [], lockInteractions = true }) {
  const { scene, animations } = useGLTF(modelPath)
  const controlsRef = useRef()
  const { camera } = useThree()
  const mixerRef = useRef(null)
  // tmp quaternion reused for slerp (avoid realloc every frame)
  const tmpQuat = useRef(new THREE.Quaternion())

  useEffect(() => {
    // center the model
    const box = new THREE.Box3().setFromObject(scene)
    const center = new THREE.Vector3()
    box.getCenter(center)
    scene.position.sub(center)

    // If GLTF has animations, create mixer and play all clips
    if (animations && animations.length > 0) {
      mixerRef.current = new THREE.AnimationMixer(scene)
      animations.forEach((clip) => {
        const action = mixerRef.current.clipAction(clip)
        action.reset()
        action.play()
      })
      console.log(`GLTF: ${animations.length} animation clip(s) started`)
    } else {
      console.log('GLTF: no animations found in model')
    }
  }, [scene, animations])

  // build smooth quaternion-based timeline
  useEffect(() => {
    ScrollTrigger.getAll().forEach(s => s.kill())
    if (!povs || povs.length === 0) return

    // initial camera state from povs[0]
    const p0 = povs[0]
    camera.position.set(p0.x, p0.y, p0.z)
    camera.fov = p0.fov ?? camera.fov
    const e0 = new THREE.Euler(
      THREE.MathUtils.degToRad(p0.rx || 0),
      THREE.MathUtils.degToRad(p0.ry || 0),
      THREE.MathUtils.degToRad(p0.rz || 0),
      'XYZ'
    )
    camera.quaternion.setFromEuler(e0)
    camera.updateProjectionMatrix()
    if (controlsRef.current) {
      controlsRef.current.target.set(p0.tx ?? 0, p0.ty ?? 0, p0.tz ?? 0)
      controlsRef.current.update()
    }

    const tl = gsap.timeline()

    function quatFromPov(p) {
      if (p.useLookAt) {
        const tmp = new THREE.Object3D()
        tmp.position.set(p.x, p.y, p.z)
        tmp.lookAt(p.tx ?? 0, p.ty ?? 0, p.tz ?? 0)
        return tmp.quaternion.clone()
      } else {
        const e = new THREE.Euler(
          THREE.MathUtils.degToRad(p.rx || 0),
          THREE.MathUtils.degToRad(p.ry || 0),
          THREE.MathUtils.degToRad(p.rz || 0),
          'XYZ'
        )
        return new THREE.Quaternion().setFromEuler(e)
      }
    }

    for (let i = 1; i < povs.length; i++) {
      const p = povs[i]
      const st = {
        trigger: `.section-${i+1}`,
        start: 'top center',
        end: 'bottom center',
        scrub: 0.6,
        onToggle(self) {
          if (controlsRef.current) controlsRef.current.enabled = !self.isActive
        }
      }

      // position tween
      tl.to(camera.position, { x: p.x, y: p.y, z: p.z, ease: 'none', scrollTrigger: st }, 0)

      // fov tween
      if (p.fov !== undefined) {
        tl.to(camera, { fov: p.fov, onUpdate: () => camera.updateProjectionMatrix(), ease: 'none', scrollTrigger: st }, 0)
      }

      // controls.target tween if useLookAt
      if (p.useLookAt && controlsRef.current) {
        const tmp = { tx: controlsRef.current.target.x, ty: controlsRef.current.target.y, tz: controlsRef.current.target.z }
        tl.to(tmp, {
          tx: p.tx ?? 0,
          ty: p.ty ?? 0,
          tz: p.tz ?? 0,
          duration: 1,
          ease: 'none',
          onUpdate: () => {
            controlsRef.current.target.set(tmp.tx, tmp.ty, tmp.tz)
            controlsRef.current.update()
          },
          scrollTrigger: st
        }, 0)
      }

      // quaternion slerp: use tmpQuat.copy(start).slerp(target, t) and copy result to camera
      const startQ = camera.quaternion.clone()
      const targetQ = quatFromPov(p)
      const slerpObj = { t: 0 }
      tl.to(slerpObj, {
        t: 1,
        duration: 1,
        ease: 'none',
        onUpdate() {
          // compute slerp from startQ -> targetQ at t into tmpQuat, then copy to camera
          tmpQuat.current.copy(startQ).slerp(targetQ, slerpObj.t)
          camera.quaternion.copy(tmpQuat.current)
        },
        scrollTrigger: st
      }, 0)
    }

    return () => {
      ScrollTrigger.getAll().forEach(s => s.kill())
      tl.kill && tl.kill()
    }
  }, [povs, camera])

  // update controls (damping) and mixer in rendering loop
  useFrame((_, delta) => {
    if (controlsRef.current) {
      controlsRef.current.enabled = !lockInteractions && (controlsRef.current.enabled !== false)
      controlsRef.current.update()
    }
    if (mixerRef.current) mixerRef.current.update(delta)
  })

  return (
    <>
      <primitive object={scene} />
      <OrbitControls ref={controlsRef} enableDamping dampingFactor={0.08} enablePan={!lockInteractions} enableZoom={!lockInteractions} enableRotate={!lockInteractions} />
    </>
  )
}

/* ---------- HresAnimate page component ---------- */
export default function HresAnimate() {
  // Put the POV values you already captured here
  const [povs] = useState([
    {
      x: -175.766, y: 49.039, z: 77.148,
      rx: -109.043, ry: -75.397, rz: -109.631,
      fov: 50, useLookAt: false
    },
    {
      x: 15.1452, y: 50.348, z: -83.3202,
      rx: -171.929, ry: 22.103, rz: 176.946,
      fov: 50, useLookAt: false
    },
    {
      x: 14.7109, y: 48.6585, z: 16.1832,
      rx: -26.319, ry: 56.08, rz: 22.316,
      fov: 50, useLookAt: false
    }
  ])

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0 }}>
        <Canvas gl={{ antialias: true }} camera={{ position: [povs[0].x, povs[0].y, povs[0].z], fov: povs[0].fov }}>
          <Suspense fallback={<Loader />}>
            <ambientLight intensity={0.4} />
            <directionalLight position={[10, 10, 10]} intensity={0.8} />
            <Environment preset="city" background={false} />
            {/* lockInteractions = true -> user cannot rotate/zoom/pan */}
            <Scene modelPath="/8hres.glb" povs={povs} lockInteractions={true} />
          </Suspense>
        </Canvas>
      </div>

      {/* content sections that drive scroll */}
      <div style={{ position: 'relative', zIndex: 5 }}>
        <section className="section-1" style={{ height: '100vh' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <h1>Start — POV 1</h1>
          </div>
        </section>

        <section className="section-2" style={{ height: '100vh' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <h1>POV 2 — Top</h1>
          </div>
        </section>

        <section className="section-3" style={{ height: '100vh' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <h1>POV 3 — Side</h1>
          </div>
        </section>

        <section style={{ height: '140vh' }} />
      </div>
    </>
  )
}
