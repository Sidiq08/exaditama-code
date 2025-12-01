// src/AnimateHres.jsx
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
        padding: "10px 14px",
        borderRadius: 8,
        background: "rgba(0,0,0,0.6)",
        color: "#fff",
        backdropFilter: "blur(6px)",
        fontSize: 13
      }}>
        Loading {Math.round(progress)}%
      </div>
    </Html>
  )
}

/* ---------- SceneWithCamera (3D + GSAP) ---------- */
function SceneWithCamera({ povs, setCamRef }) {
  const { scene } = useGLTF("/8hres.glb")
  const controlsRef = useRef()
  const { camera } = useThree()

  // expose camera + controls to parent
  useEffect(() => {
    if (setCamRef) setCamRef({ camera, controlsRef })
  }, [camera, setCamRef])

  // center model once loaded
  useEffect(() => {
    const box = new THREE.Box3().setFromObject(scene)
    const center = new THREE.Vector3()
    box.getCenter(center)
    scene.position.sub(center)

    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0)
      controlsRef.current.update()
    }
  }, [scene])

  // build scroll timeline from povs
  useEffect(() => {
    ScrollTrigger.getAll().forEach(s => s.kill())
    if (!povs || povs.length === 0) return

    const tl = gsap.timeline()

    // apply initial POV immediately
    const p0 = povs[0]
    camera.position.set(p0.x, p0.y, p0.z)
    camera.rotation.set(
      THREE.MathUtils.degToRad(p0.rx || 0),
      THREE.MathUtils.degToRad(p0.ry || 0),
      THREE.MathUtils.degToRad(p0.rz || 0),
    )
    if (p0.fov !== undefined) camera.fov = p0.fov
    camera.updateProjectionMatrix()

    for (let i = 1; i < povs.length; i++) {
      const p = povs[i]
      const st = {
        trigger: `.section-${i+1}`,
        start: "top center",
        end: "bottom center",
        scrub: 0.6,
      }

      // position tween
      tl.to(camera.position, { x: p.x, y: p.y, z: p.z, scrollTrigger: st }, 0)

      // rotation tween (use temp to animate)
      const rotTmp = { rx: camera.rotation.x, ry: camera.rotation.y, rz: camera.rotation.z }
      tl.to(rotTmp, {
        rx: THREE.MathUtils.degToRad(p.rx || 0),
        ry: THREE.MathUtils.degToRad(p.ry || 0),
        rz: THREE.MathUtils.degToRad(p.rz || 0),
        onUpdate: () => camera.rotation.set(rotTmp.rx, rotTmp.ry, rotTmp.rz),
        scrollTrigger: st
      }, 0)

      // fov
      if (p.fov !== undefined) {
        tl.to(camera, { fov: p.fov, onUpdate: () => camera.updateProjectionMatrix(), scrollTrigger: st }, 0)
      }

      // lookAt => tween controls.target if enabled
      if (p.useLookAt && controlsRef.current) {
        const tmp = { tx: controlsRef.current.target.x, ty: controlsRef.current.target.y, tz: controlsRef.current.target.z }
        tl.to(tmp, {
          tx: p.tx ?? 0,
          ty: p.ty ?? 0,
          tz: p.tz ?? 0,
          onUpdate: () => { controlsRef.current.target.set(tmp.tx, tmp.ty, tmp.tz); controlsRef.current.update() },
          scrollTrigger: st
        }, 0)
      }
    }

    return () => {
      ScrollTrigger.getAll().forEach(s => s.kill())
    }
  }, [povs, camera])

  useFrame(() => {
    if (controlsRef.current) controlsRef.current.update()
  })

  return (
    <>
      <primitive object={scene} />
      <OrbitControls ref={controlsRef} enableDamping dampingFactor={0.08} />
    </>
  )
}

/* ---------- Helper components for labeled input (grid fixes) ---------- */
function LabeledRow({ label, children }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>{label}</div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 8,
        alignItems: 'start'
      }}>
        {children}
      </div>
    </div>
  )
}

function NumberInput({ value, onChange, placeholder }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%',
        minWidth: 72,
        padding: '8px 10px',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.12)',
        background: 'rgba(255,255,255,0.06)',
        color: 'white',
        outline: 'none',
        fontSize: 14,
        boxSizing: 'border-box'
      }}
    />
  )
}

/* ---------- Main component (with live capture using RAF polling) ---------- */
export default function AnimateHres() {
  // default POVs
  const [povs, setPovs] = useState([
    { x: 0, y: 2.5, z: 9, rx: 0, ry: 0, rz: 0, fov: 50, useLookAt: false },
    { x: 0, y: 9, z: 4, rx: -30, ry: 0, rz: 0, fov: 50, useLookAt: false },
    { x: -7, y: 2.2, z: 4, rx: 0, ry: 25, rz: 0, fov: 50, useLookAt: false }
  ])

  const [working, setWorking] = useState(() => povs.map(p => ({ ...p })))
  const camControlsRef = useRef(null) // { camera, controlsRef }

  // Live camera readouts (state for UI display)
  const [live, setLive] = useState({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, fov: 50 })
  const liveRef = useRef(live)
  liveRef.current = live

  const [followLive, setFollowLive] = useState(false) // if true, inputs follow camera live

  // expose camera+controls from SceneWithCamera
  function setCamRef(val) { camControlsRef.current = val }

  // POLLING LOOP (requestAnimationFrame) to read camera values — safe outside Canvas
  useEffect(() => {
    let mounted = true
    let rafId = null
    let last = 0

    function tick(timestamp) {
      if (!mounted) return
      const camRef = camControlsRef.current
      if (camRef && typeof timestamp === 'number') {
        // throttle to ~8–12fps UI updates
        if (timestamp - last > 100) {
          last = timestamp
          const cam = camRef.camera
          const pos = { x: cam.position.x, y: cam.position.y, z: cam.position.z }
          const rot = {
            rx: THREE.MathUtils.radToDeg(cam.rotation.x),
            ry: THREE.MathUtils.radToDeg(cam.rotation.y),
            rz: THREE.MathUtils.radToDeg(cam.rotation.z)
          }
          const fov = cam.fov
          const next = { ...pos, ...rot, fov: Math.round(fov * 100) / 100 }
          setLive(next)

          if (followLive) {
            setWorking(prev => {
              const copy = JSON.parse(JSON.stringify(prev))
              if (copy[0]) {
                copy[0].x = Number(next.x.toFixed(3))
                copy[0].y = Number(next.y.toFixed(3))
                copy[0].z = Number(next.z.toFixed(3))
                copy[0].rx = Number(next.rx.toFixed(3))
                copy[0].ry = Number(next.ry.toFixed(3))
                copy[0].rz = Number(next.rz.toFixed(3))
                copy[0].fov = next.fov
              }
              return copy
            })
          }
        }
      }
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => {
      mounted = false
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [followLive])

  // sanitize helper
  function sanitizeWorking() {
    return working.map(w => ({
      x: Number(w.x || 0), y: Number(w.y || 0), z: Number(w.z || 0),
      rx: Number(w.rx || 0), ry: Number(w.ry || 0), rz: Number(w.rz || 0),
      fov: w.fov !== undefined && w.fov !== '' ? Number(w.fov) : undefined,
      useLookAt: !!w.useLookAt,
      tx: w.tx !== undefined ? Number(w.tx) : undefined,
      ty: w.ty !== undefined ? Number(w.ty) : undefined,
      tz: w.tz !== undefined ? Number(w.tz) : undefined,
    }))
  }

  // preview (set camera to input values immediately)
  function preview(index) {
    if (!camControlsRef.current) return
    const { camera, controlsRef } = camControlsRef.current
    const p = sanitizeWorking()[index]
    camera.position.set(p.x, p.y, p.z)
    camera.rotation.set(THREE.MathUtils.degToRad(p.rx), THREE.MathUtils.degToRad(p.ry), THREE.MathUtils.degToRad(p.rz))
    if (p.fov !== undefined) { camera.fov = p.fov; camera.updateProjectionMatrix() }
    if (p.useLookAt && controlsRef.current) {
      controlsRef.current.target.set(p.tx ?? 0, p.ty ?? 0, p.tz ?? 0)
      controlsRef.current.update()
    } else if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0)
      controlsRef.current.update()
    }
  }

  // apply one POV into timeline/store
  function applyOne(index) {
    const sanitized = sanitizeWorking()
    const copy = [...povs]
    copy[index] = sanitized[index]
    setPovs(copy)
    setWorking(copy.map(p => ({ ...p })))
    setTimeout(() => ScrollTrigger.refresh(), 50)
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  function applyAll() {
    const sanitized = sanitizeWorking()
    setPovs(sanitized)
    setWorking(sanitized.map(p => ({ ...p })))
    setTimeout(() => ScrollTrigger.refresh(), 50)
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  // grab current camera values into the given POV input (does not mutate timeline)
  function grabCurrentTo(index) {
    if (!camControlsRef.current) return
    const cam = camControlsRef.current.camera
    const newWorking = JSON.parse(JSON.stringify(working))
    newWorking[index] = {
      ...newWorking[index],
      x: Number(cam.position.x.toFixed(4)),
      y: Number(cam.position.y.toFixed(4)),
      z: Number(cam.position.z.toFixed(4)),
      rx: Number(THREE.MathUtils.radToDeg(cam.rotation.x).toFixed(3)),
      ry: Number(THREE.MathUtils.radToDeg(cam.rotation.y).toFixed(3)),
      rz: Number(THREE.MathUtils.radToDeg(cam.rotation.z).toFixed(3)),
      fov: Number(cam.fov.toFixed(3))
    }
    setWorking(newWorking)
  }

  // copy current camera values (live) to clipboard as JSON
  async function copyCurrentToClipboard() {
    if (!camControlsRef.current) return
    const cam = camControlsRef.current.camera
    const obj = {
      x: cam.position.x,
      y: cam.position.y,
      z: cam.position.z,
      rx: THREE.MathUtils.radToDeg(cam.rotation.x),
      ry: THREE.MathUtils.radToDeg(cam.rotation.y),
      rz: THREE.MathUtils.radToDeg(cam.rotation.z),
      fov: cam.fov
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(obj, null, 2))
      alert('Current camera JSON copied to clipboard')
    } catch (e) {
      console.warn('clipboard failed', e)
      alert('Copy failed — check browser permission')
    }
  }

  // update working inputs from UI
  function onChangeField(idx, key, val) {
    const copy = JSON.parse(JSON.stringify(working))
    copy[idx][key] = val
    setWorking(copy)
  }

  return (
    <>
      {/* CANVAS */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}>
        <Canvas camera={{ position: [povs[0].x, povs[0].y, povs[0].z], fov: povs[0].fov ?? 50 }}>
          <Suspense fallback={<Loader />}>
            <ambientLight intensity={0.35} />
            <directionalLight position={[5, 10, 5]} intensity={0.7} />
            <Environment preset="city" />
            <SceneWithCamera povs={povs} setCamRef={setCamRef} />
          </Suspense>
        </Canvas>
      </div>

      {/* UI PANEL */}
      <div style={{
        position: 'fixed',
        top: 14,
        right: 14,
        zIndex: 99,
        width: 420,
        maxWidth: 'calc(100vw - 28px)',
        maxHeight: 'calc(100vh - 28px)',
        overflowY: 'auto',
        background: 'linear-gradient(180deg, rgba(18,18,18,0.96), rgba(8,8,8,0.92))',
        padding: 16,
        borderRadius: 12,
        color: 'white',
        boxShadow: '0 12px 48px rgba(0,0,0,0.45)',
        fontFamily: 'Inter, Roboto, sans-serif'
      }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>POV Editor — Live Capture</h3>
          <div style={{ fontSize: 12, opacity: 0.85 }}>units: unitless / rotations in degrees</div>
        </div>

        {/* LIVE READOUT */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 13 }}>
            <div style={{ opacity: 0.9 }}>Live Camera</div>
            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>
              pos: {live.x.toFixed(3)}, {live.y.toFixed(3)}, {live.z.toFixed(3)} &nbsp; • &nbsp;
              rot: {live.rx.toFixed(2)}°, {live.ry.toFixed(2)}°, {live.rz.toFixed(2)}° &nbsp; • &nbsp;
              fov: {live.fov}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setFollowLive(l => !l)}
              style={{
                padding: '8px 10px',
                borderRadius: 8,
                background: followLive ? 'linear-gradient(180deg,#10b981,#059669)' : 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'white',
                cursor: 'pointer'
              }}
              title="Toggle: when ON, inputs update live as you move the camera"
            >
              {followLive ? 'Following Live' : 'Follow Live'}
            </button>

            <button
              onClick={copyCurrentToClipboard}
              style={{
                padding: '8px 10px',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'white',
                cursor: 'pointer'
              }}
            >
              Copy JSON
            </button>
          </div>
        </div>

        {/* POV inputs */}
        {working.map((p, i) => (
          <div key={i} style={{ marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <strong>POV {i + 1}</strong>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{i === 0 ? 'start' : `section-${i+1}`}</div>
            </div>

            <LabeledRow label="Position (X, Y, Z)">
              <NumberInput value={p.x} onChange={v => onChangeField(i, 'x', v)} placeholder="X" />
              <NumberInput value={p.y} onChange={v => onChangeField(i, 'y', v)} placeholder="Y" />
              <NumberInput value={p.z} onChange={v => onChangeField(i, 'z', v)} placeholder="Z" />
            </LabeledRow>

            <LabeledRow label="Rotation (RX°, RY°, RZ°)">
              <NumberInput value={p.rx} onChange={v => onChangeField(i, 'rx', v)} placeholder="RX" />
              <NumberInput value={p.ry} onChange={v => onChangeField(i, 'ry', v)} placeholder="RY" />
              <NumberInput value={p.rz} onChange={v => onChangeField(i, 'rz', v)} placeholder="RZ" />
            </LabeledRow>

            <LabeledRow label="FOV">
              <NumberInput value={p.fov} onChange={v => onChangeField(i, 'fov', v)} placeholder="Field of View" />
              <div />
              <div />
            </LabeledRow>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={!!p.useLookAt}
                  onChange={e => onChangeField(i, 'useLookAt', e.target.checked)}
                />
                <span style={{ fontSize: 13 }}>Use LookAt (target)</span>
              </label>
            </div>

            {p.useLookAt && (
              <LabeledRow label="LookAt Target (TX, TY, TZ)">
                <NumberInput value={p.tx ?? 0} onChange={v => onChangeField(i, 'tx', v)} placeholder="TX" />
                <NumberInput value={p.ty ?? 0} onChange={v => onChangeField(i, 'ty', v)} placeholder="TY" />
                <NumberInput value={p.tz ?? 0} onChange={v => onChangeField(i, 'tz', v)} placeholder="TZ" />
              </LabeledRow>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => preview(i)}
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: 'white',
                  border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer'
                }}
              >
                Preview
              </button>

              <button
                onClick={() => applyOne(i)}
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.12)', color: 'white',
                  border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer'
                }}
              >
                Apply POV
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                onClick={() => grabCurrentTo(i)}
                style={{
                  flex: 1, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)',
                  color: 'white', border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer'
                }}
              >
                Grab Current → Inputs
              </button>

              <button
                onClick={async () => {
                  const sanitized = sanitizeWorking()[i]
                  try {
                    await navigator.clipboard.writeText(JSON.stringify(sanitized, null, 2))
                    alert('POV JSON copied to clipboard')
                  } catch (e) {
                    alert('Copy failed')
                  }
                }}
                style={{
                  flex: 1, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)',
                  color: 'white', border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer'
                }}
              >
                Copy POV JSON
              </button>
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={applyAll}
            style={{
              flex: 1, padding: '11px 12px', borderRadius: 8, background: 'linear-gradient(180deg,#6b7280,#374151)',
              color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700
            }}
          >
            Apply All
          </button>

          <button
            onClick={() => { setWorking(povs.map(p => ({ ...p }))) }}
            style={{
              flex: 1, padding: '11px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)',
              color: 'white', border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer'
            }}
          >
            Reset
          </button>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
          Tip: put your mouse on the 3D canvas and move the camera (orbit/zoom/pan) — the Live Camera readout will show current values.
          Use <strong>Grab Current → Inputs</strong> to copy live values into any POV input, then <strong>Apply POV</strong> to store it.
        </div>
      </div>

      {/* SECTIONS */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <section className="section-1" style={{ height: "100vh" }} />
        <section className="section-2" style={{ height: "100vh" }} />
        <section className="section-3" style={{ height: "100vh" }} />
        <section style={{ height: "140vh" }} />
      </div>
    </>
  )
}
