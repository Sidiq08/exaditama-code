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
function Scene({ modelPath = '/8hres.glb', sections = [], lockInteractions = true, tweenDuration = 0.9 }) {
  const { scene, animations } = useGLTF(modelPath)
  const controlsRef = useRef()
  const { camera: cam, gl } = useThree()
  const mixerRef = useRef(null)
  const tmpQuat = useRef(new THREE.Quaternion())
  const tmpObj3 = useRef(new THREE.Object3D())

  // map idOrName -> object reference + metadata
  const objectsRef = useRef({})

  function collectMeshes(obj) {
    const meshes = []
    obj.traverse((child) => {
      if (child.isMesh) meshes.push(child)
    })
    return meshes
  }

  function inspectAndStoreObject(idOrName) {
    if (objectsRef.current[idOrName]) return objectsRef.current[idOrName]

    // try by uuid
    let obj = scene.getObjectByProperty('uuid', idOrName)
    // try by name
    if (!obj) obj = scene.getObjectByName(idOrName)
    // loose includes
    if (!obj) {
      scene.traverse((child) => {
        if (!obj && child.name && child.name.includes(idOrName)) obj = child
      })
    }

    if (!obj) {
      console.warn('Object not found in scene for id/name:', idOrName)
      return null
    }

    const meshes = collectMeshes(obj)
    if (!meshes.length) {
      console.warn('Warning: no descendant meshes found for id/name:', idOrName, 'object:', obj)
    }

    const meshEntries = meshes.map(mesh => {
      const mats = []
      if (Array.isArray(mesh.material)) mesh.material.forEach(m => mats.push(m))
      else if (mesh.material) mats.push(mesh.material)

      mats.forEach((m) => {
        if (typeof m.opacity === 'undefined') m.opacity = 1
        m.transparent = true
        m.needsUpdate = true
      })

      return { mesh, materials: mats, origOpacities: mats.map(m => m.opacity) }
    })

    const meta = { obj, meshEntries, visible: obj.visible }
    objectsRef.current[idOrName] = meta
    return meta
  }

  function tweenObjectOpacity(idOrName, targetOpacity, duration = tweenDuration) {
    const meta = inspectAndStoreObject(idOrName)
    if (!meta) return
    const { obj, meshEntries } = meta

    if (targetOpacity > 0 && obj.visible === false) obj.visible = true

    meshEntries.forEach(entry => {
      entry.materials.forEach((m) => {
        gsap.killTweensOf(m, 'opacity')
        m.transparent = true
        gsap.to(m, {
          opacity: targetOpacity,
          duration,
          ease: 'power2.out',
          onUpdate: () => { m.needsUpdate = true },
          onComplete: () => {
            if (Math.abs(targetOpacity) < 1e-4) {
              const allZeroThis = entry.materials.every(mm => Math.abs(mm.opacity) < 1e-4)
              if (allZeroThis) {
                const allZero = meshEntries.every(en => en.materials.every(mm => Math.abs(mm.opacity) < 1e-4))
                if (allZero) obj.visible = false
              }
            }
            m.depthWrite = Math.abs(targetOpacity - 1) < 1e-4
            m.needsUpdate = true
          }
        })
      })
    })
  }

  function logSceneMeshes() {
    const found = []
    scene.traverse((child) => {
      if (child.isMesh) {
        found.push({ uuid: child.uuid, name: child.name || '(no-name)', parent: child.parent?.name || '(no-parent)' })
      }
    })
    console.groupCollapsed(`GLTF scene meshes (${found.length})`)
    found.forEach(f => console.log(`uuid: ${f.uuid}  |  name: ${f.name}  |  parent: ${f.parent}`))
    console.groupEnd()
    window.__GLTF_MESHES = found
    return found
  }

  useEffect(() => {
    if (!scene) return

    // center the model
    const box = new THREE.Box3().setFromObject(scene)
    const center = new THREE.Vector3()
    box.getCenter(center)
    scene.position.sub(center)

    // animations
    if (animations && animations.length > 0) {
      mixerRef.current = new THREE.AnimationMixer(scene)
      animations.forEach((clip) => {
        const action = mixerRef.current.clipAction(clip)
        action.reset()
        action.play()
      })
    }

    // log meshes & preload requested ids
    requestAnimationFrame(() => {
      const allMeshes = logSceneMeshes() || []
      sections.forEach(sec => {
        if (sec.objects) {
          Object.keys(sec.objects).forEach(id => inspectAndStoreObject(id))
        }
      })

      const requested = []
      sections.forEach(sec => Object.keys(sec.objects || {}).forEach(k => requested.push(k)))
      const availableSet = new Set(allMeshes.map(m => m.uuid).concat(allMeshes.map(m => m.name)))
      const missing = requested.filter(r => !availableSet.has(r))
      if (missing.length) console.warn('Requested object ids/names NOT found in GLTF scene (check mesh list):', missing)
      else console.log('All requested ids/names found in scene.')
    })
  }, [scene, animations, sections])

  function quatFromPov(p) {
    if (typeof p.qx === 'number' && typeof p.qy === 'number' && typeof p.qz === 'number' && typeof p.qw === 'number') {
      return new THREE.Quaternion(p.qx, p.qy, p.qz, p.qw).normalize()
    }
    if (p.useLookAt) {
      tmpObj3.current.position.set(p.x, p.y, p.z)
      tmpObj3.current.lookAt(p.tx ?? 0, p.ty ?? 0, p.tz ?? 0)
      return tmpObj3.current.quaternion.clone()
    }
    const e = new THREE.Euler(
      THREE.MathUtils.degToRad(p.rx || 0),
      THREE.MathUtils.degToRad(p.ry || 0),
      THREE.MathUtils.degToRad(p.rz || 0),
      'XYZ'
    )
    return new THREE.Quaternion().setFromEuler(e)
  }

  useEffect(() => {
    ScrollTrigger.getAll().forEach(s => s.kill())
    if (!sections || sections.length === 0) return

    // apply first camera state
    const first = sections[0]
    const p0 = first.pov
    cam.position.set(p0.x, p0.y, p0.z)
    cam.fov = p0.fov ?? cam.fov
    cam.quaternion.copy(quatFromPov(p0))
    cam.updateProjectionMatrix()
    cam.updateMatrixWorld(true)

    if (controlsRef.current) {
      if (typeof p0.tx === 'number') controlsRef.current.target.set(p0.tx, p0.ty, p0.tz)
      else controlsRef.current.target.set(0, 0, 0)
      controlsRef.current.update()
      controlsRef.current.enablePan = !lockInteractions
      controlsRef.current.enableZoom = !lockInteractions
      controlsRef.current.enableRotate = !lockInteractions
    }

    // set initial object states (immediate)
    if (first.objects) {
      Object.entries(first.objects).forEach(([id, { visible, opacity }]) => {
        const meta = inspectAndStoreObject(id)
        if (!meta) return
        meta.meshEntries.forEach(entry => {
          entry.materials.forEach((m) => {
            const op = typeof opacity === 'number' ? opacity : (visible ? 1 : 0)
            m.opacity = op
            m.transparent = op < 1 ? true : m.transparent
            m.depthWrite = Math.abs(op - 1) < 1e-4
            m.needsUpdate = true
          })
        })
        meta.obj.visible = !!visible && ((typeof opacity === 'number' ? opacity : (visible ? 1 : 0)) > 0)
      })
    }

    function gotoSection(sec) {
      const p = sec.pov
      gsap.killTweensOf(cam.position)
      gsap.killTweensOf(cam)
      gsap.killTweensOf(tmpQuat.current)

      if (controlsRef.current) controlsRef.current.enabled = false

      gsap.to(cam.position, { x: p.x, y: p.y, z: p.z, duration: tweenDuration, ease: 'power2.out' })

      if (p.fov !== undefined) {
        gsap.to(cam, { fov: p.fov, duration: tweenDuration, ease: 'power2.out', onUpdate: () => cam.updateProjectionMatrix() })
      }

      if (controlsRef.current && typeof p.tx === 'number') {
        const tmp = { tx: controlsRef.current.target.x, ty: controlsRef.current.target.y, tz: controlsRef.current.target.z }
        gsap.to(tmp, {
          tx: p.tx, ty: p.ty, tz: p.tz, duration: tweenDuration, ease: 'power2.out',
          onUpdate: () => { controlsRef.current.target.set(tmp.tx, tmp.ty, tmp.tz); controlsRef.current.update() }
        })
      }

      const startQ = cam.quaternion.clone()
      const targetQ = quatFromPov(p)
      const slerpObj = { t: 0 }
      gsap.to(slerpObj, {
        t: 1,
        duration: tweenDuration,
        ease: 'power2.out',
        onUpdate: () => {
          tmpQuat.current.copy(startQ).slerp(targetQ, slerpObj.t)
          cam.quaternion.copy(tmpQuat.current)
          cam.updateMatrixWorld(true)
        },
        onComplete: () => {
          cam.quaternion.copy(targetQ)
          cam.updateMatrixWorld(true)
          if (controlsRef.current) controlsRef.current.enabled = !lockInteractions
        }
      })

      // objects
      if (sec.objects) {
        Object.entries(sec.objects).forEach(([id, { visible, opacity }]) => {
          const meta = inspectAndStoreObject(id)
          if (!meta) return
          const targetOpacity = typeof opacity === 'number' ? opacity : (visible ? 1 : 0)
          if (targetOpacity > 0) meta.obj.visible = true
          tweenObjectOpacity(id, targetOpacity, tweenDuration)
        })

        const knownKeys = Object.keys(objectsRef.current)
        knownKeys.forEach(existingKey => {
          if (!sec.objects.hasOwnProperty(existingKey)) {
            tweenObjectOpacity(existingKey, 0, tweenDuration)
          }
        })
      }
    }

    const triggers = []
    sections.forEach((sec, i) => {
      const idx = i + 1
      const triggerEl = `.section-${idx}`
      const st = ScrollTrigger.create({
        trigger: triggerEl,
        start: 'top center',
        end: 'bottom center',
        onEnter: () => gotoSection(sec),
        onEnterBack: () => gotoSection(sec),
        scrub: false
      })
      triggers.push(st)
    })

    return () => {
      ScrollTrigger.getAll().forEach(s => s.kill())
      triggers.forEach(t => t && t.kill && t.kill())
    }
  }, [sections, lockInteractions, tweenDuration, cam])

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
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.08}
        enablePan={!lockInteractions}
        enableZoom={!lockInteractions}
        enableRotate={!lockInteractions}
      />
    </>
  )
}

/* ---------- HresAnimate page component ---------- */
export default function HresAnimate() {
  // NOTE: use your mesh *names* found in console (window.__GLTF_MESHES) for objects keys
  const [sections] = useState([
    {
      pov: { x: -1.8586, y: 17.2018, z: 157.6398, fov: 50, qx: -0.01911603328316908, qy: -0.009971348160766055, qz: -0.000190656945425666, qw: 0.9997675295473958, tx: 1.4329, ty: 10.8889, tz: -7.3499 },
      objects: { "Axial_Flux_Generator001": { visible: true, opacity: 1 }, "VAWT-1004": { visible: true, opacity: 1 }, "VAWT-1004_1": { visible: true, opacity: 1 }, "VAWT-1004_2": { visible: true, opacity: 1 }, "VAWT-1013": { visible: true, opacity: 1 }, "VAWT-1013_1": { visible: true, opacity: 1 }, "VAWT-1014": { visible: true, opacity: 1 }, "VAWT-1014_1": { visible: true, opacity: 1 }, "VAWT-1005": { visible: true, opacity: 1 }, "VAWT-1005_1": { visible: true, opacity: 1 }, "VAWT-1003": { visible: true, opacity: 1 }, "VAWT-1003_1": { visible: true, opacity: 1 }, "Whale_V03001": { visible: true, opacity: 1 } }
    },
    {
      pov: { x: -4.661, y: 57.6506, z: 80.2053, fov: 50, qx: -0.11856573815417971, qy: -0.009902802976316263, qz: -0.0011825337243017617, qw: 0.9928961183543613, tx: -2.9312, ty: 36.638, tz: -6.5051 },
      objects: { "Axial_Flux_Generator001": { visible: true, opacity: 1 }, "VAWT-1004": { visible: true, opacity: 0.1 }, "VAWT-1004_1": { visible: true, opacity: 0.1 }, "VAWT-1004_2": { visible: true, opacity: 1 }, "VAWT-1013": { visible: true, opacity: 0.1 }, "VAWT-1013_1": { visible: true, opacity: 0.1 }, "VAWT-1014": { visible: true, opacity: 0 }, "VAWT-1014_1": { visible: true, opacity: 0 }, "VAWT-1005": { visible: true, opacity: 1 }, "VAWT-1005_1": { visible: true, opacity: 1 }, "VAWT-1003": { visible: true, opacity: 1 }, "VAWT-1003_1": { visible: true, opacity: 1 }, "Whale_V03001": { visible: true, opacity: 1 } }
    },
    {
      pov: { x: -14.8298, y: 44.6751, z: 10.7702, fov: 50, qx: -0.1545042036099303, qy: -0.28461593931415574, qz: -0.046535493743707954, qw: 0.944963843740707, tx: -3.1344, ty: 37.5601, tz: -6.8838 },
      objects: { "Axial_Flux_Generator001": { visible: true, opacity: 1 }, "VAWT-1004": { visible: true, opacity: 0.1 }, "VAWT-1004_1": { visible: true, opacity: 0.1 }, "VAWT-1004_2": { visible: true, opacity: 1 }, "VAWT-1013": { visible: true, opacity: 0 }, "VAWT-1013_1": { visible: true, opacity: 0 }, "VAWT-1014": { visible: true, opacity: 1 }, "VAWT-1014_1": { visible: true, opacity: 1 }, "VAWT-1005": { visible: true, opacity: 1 }, "VAWT-1005_1": { visible: true, opacity: 1 }, "VAWT-1003": { visible: true, opacity: 1 }, "VAWT-1003_1": { visible: true, opacity: 1 }, "Whale_V03001": { visible: false, opacity: 1 } }
    },
    {
      pov: { x: 23.313, y: -13.2302, z: 40.661, fov: 50, qx: 0.007374376267582932, qy: 0.1654528212469029, qz: -0.0012371978537792326, qw: 0.9861893590267414, tx: 4.9605, ty: -12.3891, tz: -12.4952 },
      objects: { "Axial_Flux_Generator001": { visible: true, opacity: 1 }, "VAWT-1004": { visible: true, opacity: 1 }, "VAWT-1004_1": { visible: true, opacity: 1 }, "VAWT-1004_2": { visible: true, opacity: 1 }, "VAWT-1013": { visible: true, opacity: 1 }, "VAWT-1013_1": { visible: true, opacity: 1 }, "VAWT-1014": { visible: true, opacity: 1 }, "VAWT-1014_1": { visible: true, opacity: 1 }, "VAWT-1005": { visible: true, opacity: 1 }, "VAWT-1005_1": { visible: true, opacity: 1 }, "VAWT-1003": { visible: true, opacity: 1 }, "VAWT-1003_1": { visible: true, opacity: 1 }, "Whale_V03001": { visible: true, opacity: 1 } }
    }
  ])

  useEffect(() => {
    document.documentElement.style.background = '#ffffff'
    document.body.style.background = '#ffffff'
  }, [])

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0 }}>
        <Canvas
          gl={{ antialias: true, alpha: true }}
          style={{ background: 'transparent', width: '100%', height: '100%', zIndex: 0 }}
          onCreated={({ gl }) => {
            gl.setClearColor(0x000000, 0)
            gl.toneMapping = THREE.ACESFilmicToneMapping
            gl.toneMappingExposure = 1.0
          }}
          camera={{ position: [sections[0].pov.x, sections[0].pov.y, sections[0].pov.z], fov: sections[0].pov.fov }}
        >
          <Suspense fallback={<Loader />}>
            <ambientLight intensity={0.9} />
            <hemisphereLight intensity={0.5} skyColor={0xddeeff} groundColor={0xffffff} />
            <directionalLight position={[10, 20, 10]} intensity={1.1} />
            <Environment preset="sunset" background={false} />
            <Scene modelPath="/8hres.glb" sections={sections} lockInteractions={true} tweenDuration={0.9} />
          </Suspense>
        </Canvas>
      </div>

      <div style={{ position: 'relative', zIndex: 10, color: '#000000' }}>
        <section className="section-1" style={{ height: '100vh', color: '#000000' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <h1>Section 1</h1>
          </div>
        </section>

        <section className="section-2" style={{ height: '100vh', color: '#000000' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <h1>Section 2</h1>
          </div>
        </section>

        <section className="section-3" style={{ height: '100vh', color: '#000000' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <h1>Section 3</h1>
          </div>
        </section>

        <section className="section-4" style={{ height: '100vh', color: '#000000' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <h1>Section 4</h1>
          </div>
        </section>

        <section style={{ height: '140vh' }} />
      </div>
    </>
  )
}
