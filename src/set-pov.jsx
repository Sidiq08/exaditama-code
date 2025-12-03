// src/set-pov.jsx
import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react'
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

/* ---------- SceneWithCamera ---------- */
function SceneWithCamera({
  modelPath = '/8hres.glb',
  povs = [],
  setCamRef,
  lockInteractions = false,
  onSceneReady,
  visibility = {},
  activeVisSection = 0
}) {
  const { scene, animations } = useGLTF(modelPath)
  const controlsRef = useRef()
  const { camera } = useThree()
  const mixerRef = useRef(null)
  const tmpQuatRef = useRef(new THREE.Quaternion())
  const mountedRef = useRef(false)

  useEffect(() => {
    if (!setCamRef) return
    const id = setTimeout(() => { try { setCamRef({ camera, controlsRef }) } catch (e) {} }, 0)
    return () => clearTimeout(id)
  }, [camera, setCamRef])

  useEffect(() => {
    if (!scene) return
    const box = new THREE.Box3().setFromObject(scene)
    const center = new THREE.Vector3()
    box.getCenter(center)
    scene.position.sub(center)

    if (animations?.length) {
      mixerRef.current = new THREE.AnimationMixer(scene)
      animations.forEach((clip) => {
        const action = mixerRef.current.clipAction(clip)
        action.reset()
        action.play()
      })
    }

    if (onSceneReady) onSceneReady(scene)

    return () => { mixerRef.current = null }
  }, [scene, animations, onSceneReady])

  useEffect(() => {
    ScrollTrigger.getAll().forEach(s => s.kill())
    if (!povs || povs.length === 0) return
    if (!mountedRef.current) {
      const p0 = povs[0] || {}
      camera.position.set(p0.x ?? 0, p0.y ?? 0, p0.z ?? 0)
      if (p0.qx !== undefined) camera.quaternion.set(p0.qx, p0.qy, p0.qz, p0.qw)
      else {
        const e0 = new THREE.Euler(
          THREE.MathUtils.degToRad(p0.rx || 0),
          THREE.MathUtils.degToRad(p0.ry || 0),
          THREE.MathUtils.degToRad(p0.rz || 0),
          'XYZ'
        )
        camera.quaternion.setFromEuler(e0)
      }
      if (p0.fov !== undefined) camera.fov = p0.fov
      camera.updateProjectionMatrix()
      if (controlsRef.current) {
        controlsRef.current.target.set(p0.tx ?? 0, p0.ty ?? 0, p0.tz ?? 0)
        controlsRef.current.update()
      }
      mountedRef.current = true
    }

    const tl = gsap.timeline()
    function quatFromPov(p) {
      if (!p) return camera.quaternion.clone()
      if (p.qx !== undefined) return new THREE.Quaternion(p.qx, p.qy, p.qz, p.qw)
      if (p.useLookAt) {
        const tmpObj = new THREE.Object3D()
        tmpObj.position.set(p.x, p.y, p.z)
        tmpObj.lookAt(p.tx ?? 0, p.ty ?? 0, p.tz ?? 0)
        return tmpObj.quaternion.clone()
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
      const selector = `.section-${i+1}`
      if (!document.querySelector(selector)) continue
      const st = { trigger: selector, start: 'top center', end: 'bottom center', scrub: 0.6, onToggle(self) {
        if (controlsRef.current) controlsRef.current.enabled = !self.isActive
      } }

      tl.to(camera.position, { x: p.x, y: p.y, z: p.z, ease: 'none', scrollTrigger: st }, 0)
      if (p.fov !== undefined) tl.to(camera, { fov: p.fov, onUpdate: () => camera.updateProjectionMatrix(), ease: 'none', scrollTrigger: st }, 0)

      if (p.useLookAt && controlsRef.current) {
        const tmp = { tx: controlsRef.current.target.x, ty: controlsRef.current.target.y, tz: controlsRef.current.target.z }
        tl.to(tmp, {
          tx: p.tx ?? 0, ty: p.ty ?? 0, tz: p.tz ?? 0, duration: 1, ease: 'none',
          onUpdate: () => { controlsRef.current.target.set(tmp.tx, tmp.ty, tmp.tz); controlsRef.current.update() },
          scrollTrigger: st
        }, 0)
      }

      const startQ = camera.quaternion.clone()
      const targetQ = quatFromPov(p)
      const obj = { t: 0 }
      tl.to(obj, {
        t: 1, duration: 1, ease: 'none',
        onUpdate() { tmpQuatRef.current.copy(startQ).slerp(targetQ, obj.t); camera.quaternion.copy(tmpQuatRef.current) },
        scrollTrigger: st
      }, 0)
    }

    return () => { ScrollTrigger.getAll().forEach(s => s.kill()); tl.kill && tl.kill() }
  }, [povs, camera])

  useFrame((_, delta) => {
    if (controlsRef.current) controlsRef.current.update()
    if (mixerRef.current) mixerRef.current.update(delta)
    if (!scene) return
    const conf = (visibility && visibility[activeVisSection]) || {}
    scene.traverse(o => {
      const node = conf[o.uuid]
      if (!node) return
      if (o.visible !== !!node.visible) o.visible = !!node.visible
      if (o.isMesh && o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        const v = typeof node.opacity === 'number' ? node.opacity : 1
        mats.forEach(mat => {
          if (mat.transparent !== true) mat.transparent = true
          if (Math.abs((mat.opacity ?? 1) - v) > 0.0001) {
            mat.opacity = v
            mat.needsUpdate = true
          }
        })
      }
    })
  })

  return (
    <>
      <primitive object={scene} />
      <OrbitControls ref={controlsRef} enableDamping dampingFactor={0.08} enablePan={!lockInteractions} enableZoom={!lockInteractions} enableRotate={!lockInteractions} />
    </>
  )
}

/* ---------- helpers ---------- */
function LabeledRow({ label, children }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>{children}</div>
    </div>
  )
}

function NumberInput({ value, onChange, placeholder }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{
        width: '100%', minWidth: 72, padding: '8px 10px', borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)',
        color: 'white', outline: 'none', fontSize: 14, boxSizing: 'border-box'
      }} />
  )
}

/* ---------- name-keyed builder ---------- */
function buildNameKeyedObjects(sectionVisibility, nodesList) {
  // nodesList: [{ uuid, name, path }, ...]
  // sectionVisibility: { uuid: { visible, opacity }, ... }
  const namesUsed = {}
  const out = {}
  nodesList.forEach(n => {
    const cfg = sectionVisibility && sectionVisibility[n.uuid] ? sectionVisibility[n.uuid] : { visible: true, opacity: 1 }
    // sanitize name
    let base = (n.name || 'Object').replace(/\s+/g, '_').replace(/[^\w\-]/g, '')
    if (!base) base = 'Object'
    let key = base
    if (namesUsed[key]) {
      // duplicate name: append short uuid slice
      key = `${base}_${n.uuid.slice(0,8)}`
    }
    namesUsed[key] = true
    out[key] = { visible: !!cfg.visible, opacity: typeof cfg.opacity === 'number' ? cfg.opacity : 1 }
  })
  return out
}

/* ---------- Main component ---------- */
export default function AnimateHres() {
  const defaultPOVs = [
    { x: 0, y: 2.5, z: 9, rx: 0, ry: 0, rz: 0, fov: 50, useLookAt: false },
    { x: 0, y: 9, z: 4, rx: -30, ry: 0, rz: 0, fov: 50, useLookAt: false },
    { x: -7, y: 2.2, z: 4, rx: 0, ry: 25, rz: 0, fov: 50, useLookAt: false }
  ]

  const [sections, setSections] = useState(() => defaultPOVs.map(p => ({ pov: { ...p }, visibility: {} })))
  const [activeSectionIdx, setActiveSectionIdx] = useState(0)
  const [activeTab, setActiveTab] = useState('camera') // 'camera' | 'visibility'

  const camControlsRef = useRef(null)
  const setCamRef = React.useCallback((val) => { camControlsRef.current = val }, [])

  const [nodes, setNodes] = useState([])
  const [search, setSearch] = useState('')
  const [live, setLive] = useState(() => ({ ...defaultPOVs[0] }))

  useEffect(() => {
    const prev = document.body.style.margin
    document.body.style.margin = '0'
    return () => { document.body.style.margin = prev }
  }, [])

  useEffect(() => {
    let mounted = true
    let raf = null
    let last = 0
    function tick(t) {
      if (!mounted) return
      const camRef = camControlsRef.current
      if (camRef && typeof t === 'number' && t - last > 80) {
        last = t
        const cam = camRef.camera
        const pos = { x: cam.position.x, y: cam.position.y, z: cam.position.z }
        const e = new THREE.Euler().setFromQuaternion(cam.quaternion, 'XYZ')
        const rot = { rx: THREE.MathUtils.radToDeg(e.x), ry: THREE.MathUtils.radToDeg(e.y), rz: THREE.MathUtils.radToDeg(e.z) }
        const fov = Math.round(cam.fov * 100) / 100
        setLive({ ...pos, ...rot, fov })
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { mounted = false; if (raf) cancelAnimationFrame(raf) }
  }, [])

  useEffect(() => { setTimeout(() => ScrollTrigger.refresh(), 80) }, [sections.length])

  const visibilityMap = React.useMemo(() => {
    const m = {}
    sections.forEach((s, idx) => { m[idx] = s.visibility || {} })
    return m
  }, [sections])

  const handleSceneReady = useCallback((scene) => {
    const list = []
    function walk(obj, path = '') {
      if (obj.isMesh || obj.type === 'Group' || obj.type === 'Object3D') {
        const name = (obj.name && obj.name.trim()) ? obj.name : obj.type || 'Object'
        list.push({ uuid: obj.uuid, name, path: path ? `${path}/${name}` : name })
      }
      obj.children?.forEach(child => walk(child, path ? `${path}/${obj.name || obj.type}` : (obj.name || obj.type)))
    }
    walk(scene, '')
    setNodes(list)
    // initialize visibility entries for any new nodes
    setSections(prev => prev.map(sec => {
      const vis = { ...(sec.visibility || {}) }
      list.forEach(n => { if (!vis[n.uuid]) vis[n.uuid] = { visible: true, opacity: 1 } })
      return { pov: { ...(sec.pov || {}) }, visibility: vis }
    }))
  }, [])

  /* ---------- small helpers to clone safely ---------- */
  const cloneSections = (cb) => setSections(prev => {
    const copy = prev.map(s => ({ pov: { ...(s.pov || {}) }, visibility: { ...(s.visibility || {}) } }))
    cb(copy)
    return copy
  })

  function addSection() {
    cloneSections(copy => {
      const last = copy[copy.length - 1]
      copy.push(last ? { pov: { ...(last.pov || {}) }, visibility: { ...(last.visibility || {}) } } : { pov: { ...defaultPOVs[0] }, visibility: {} })
    })
  }
  function removeSection(idx) {
    if (sections.length <= 1) { alert('Cannot remove last section'); return }
    setSections(prev => { const c = prev.slice(); c.splice(idx, 1); return c })
    setActiveSectionIdx(i => Math.max(0, Math.min(i, sections.length - 2)))
  }

  function previewSection(idx) {
    if (!camControlsRef.current) return
    const { camera, controlsRef } = camControlsRef.current
    const p = sections[idx]?.pov
    if (!p) return
    if (p.qx !== undefined) camera.quaternion.set(p.qx, p.qy, p.qz, p.qw)
    else camera.rotation.set(THREE.MathUtils.degToRad(p.rx || 0), THREE.MathUtils.degToRad(p.ry || 0), THREE.MathUtils.degToRad(p.rz || 0))
    camera.position.set(p.x ?? 0, p.y ?? 0, p.z ?? 0)
    if (p.fov !== undefined) { camera.fov = p.fov; camera.updateProjectionMatrix() }
    if (controlsRef?.current) {
      if (p.tx !== undefined || p.ty !== undefined || p.tz !== undefined) controlsRef.current.target.set(p.tx ?? 0, p.ty ?? 0, p.tz ?? 0)
      else controlsRef.current.target.set(0, 0, 0)
      controlsRef.current.update()
    }
  }

  function grabCurrentToSection(idx) {
    if (!camControlsRef.current) return
    const cam = camControlsRef.current.camera
    const controlsRefObj = camControlsRef.current.controlsRef
    const e = new THREE.Euler().setFromQuaternion(cam.quaternion, 'XYZ')
    cloneSections(copy => {
      copy[idx].pov = {
        x: Number(cam.position.x.toFixed(4)),
        y: Number(cam.position.y.toFixed(4)),
        z: Number(cam.position.z.toFixed(4)),
        rx: Number(THREE.MathUtils.radToDeg(e.x).toFixed(3)),
        ry: Number(THREE.MathUtils.radToDeg(e.y).toFixed(3)),
        rz: Number(THREE.MathUtils.radToDeg(e.z).toFixed(3)),
        fov: Number(cam.fov.toFixed(3)),
        qx: cam.quaternion.x, qy: cam.quaternion.y, qz: cam.quaternion.z, qw: cam.quaternion.w,
        tx: controlsRefObj?.current ? Number(controlsRefObj.current.target.x.toFixed(4)) : undefined,
        ty: controlsRefObj?.current ? Number(controlsRefObj.current.target.y.toFixed(4)) : undefined,
        tz: controlsRefObj?.current ? Number(controlsRefObj.current.target.z.toFixed(4)) : undefined
      }
    })
  }

  function updatePovField(idx, key, val) {
    cloneSections(copy => { if (!copy[idx]) copy[idx] = { pov: {}, visibility: {} }; copy[idx].pov[key] = val })
  }

  function toggleObjectVisibility(sectionIdx, uuid) {
    cloneSections(copy => { const sec = copy[sectionIdx]; if (!sec.visibility[uuid]) sec.visibility[uuid] = { visible: true, opacity: 1 }; sec.visibility[uuid].visible = !sec.visibility[uuid].visible })
  }
  function setObjectOpacity(sectionIdx, uuid, v) {
    const val = Math.max(0, Math.min(1, Number(v)))
    cloneSections(copy => { const sec = copy[sectionIdx]; if (!sec.visibility[uuid]) sec.visibility[uuid] = { visible: true, opacity: 1 }; sec.visibility[uuid].opacity = val })
  }

  function setAllVisibility(sectionIdx, val) {
    cloneSections(copy => {
      const sec = copy[sectionIdx]
      nodes.forEach(n => { sec.visibility[n.uuid] = { ...(sec.visibility[n.uuid] || { visible: true, opacity: 1 }), visible: !!val } })
    })
  }

  /* ---------- JSON export/copy (name-keyed) ---------- */
  function copySectionJSON(idx) {
    const sec = sections[idx]
    if (!sec) return
    const objectsByName = buildNameKeyedObjects(sec.visibility || {}, nodes)
    const out = { pov: sec.pov || {}, objects: objectsByName }
    navigator.clipboard?.writeText(JSON.stringify(out, null, 2)).then(() => alert('Section JSON (name-keyed) copied')).catch(() => alert('Copy failed'))
  }

  function copyAllJSON() {
    const out = {}
    sections.forEach((s, i) => {
      out[`section${i+1}`] = { pov: s.pov || {}, objects: buildNameKeyedObjects(s.visibility || {}, nodes) }
    })
    navigator.clipboard?.writeText(JSON.stringify(out, null, 2)).then(() => alert('All sections JSON (name-keyed) copied')).catch(() => alert('Copy failed'))
  }

  function exportAllJSONFile() {
    const out = {}
    sections.forEach((s, i) => {
      out[`section${i+1}`] = { pov: s.pov || {}, objects: buildNameKeyedObjects(s.visibility || {}, nodes) }
    })
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sections.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const povsForScene = sections.map(s => s.pov || {})

  return (
    <>
      <div style={{
        position: 'fixed', inset: 0, display: 'grid', gridTemplateColumns: '420px 1fr',
        height: '100vh', width: '100vw', background: '#141414', color: '#fff', fontFamily: 'Inter, Roboto, sans-serif'
      }}>
        {/* LEFT: Controls */}
        <div style={{ borderRight: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: 12, borderBottom: '1px solid rgba(255,255,255,0.04)', background: '#111', zIndex: 4 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ overflowX: 'auto', whiteSpace: 'nowrap', display: 'flex', gap: 8, flex: 1 }}>
                {sections.map((_, i) => (
                  <button key={i} onClick={() => setActiveSectionIdx(i)} style={{
                    flex: '0 0 auto', padding: '8px 12px', borderRadius: 6,
                    background: activeSectionIdx === i ? '#6b46c1' : 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.06)', color: '#fff', cursor: 'pointer'
                  }}>
                    Section {i + 1}
                  </button>
                ))}
                <button onClick={addSection} title="Add section" style={{ flex: '0 0 auto', padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.03)', color: '#fff', cursor: 'pointer' }}>＋</button>
                <button onClick={() => removeSection(activeSectionIdx)} title="Remove active" style={{ flex: '0 0 auto', padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.03)', color: '#fff', cursor: 'pointer' }}>—</button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={() => setActiveTab('camera')} style={{ padding: '8px 12px', borderRadius: 6, background: activeTab === 'camera' ? '#6b46c1' : 'transparent', border: '1px solid rgba(255,255,255,0.04)', color: '#fff', fontWeight: 600 }}>Camera POV</button>
              <button onClick={() => setActiveTab('visibility')} style={{ padding: '8px 12px', borderRadius: 6, background: activeTab === 'visibility' ? '#6b46c1' : 'transparent', border: '1px solid rgba(255,255,255,0.04)', color: '#fff', fontWeight: 600 }}>Object Visibility</button>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button onClick={copyAllJSON} style={controlBtn}>Copy All JSON</button>
                <button onClick={exportAllJSONFile} style={controlBtn}>Export All JSON</button>
              </div>
            </div>
          </div>

          <div style={{ padding: 12, overflow: 'auto', minHeight: 0 }}>
            {activeTab === 'camera' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontWeight: 700 }}>Camera — Section {activeSectionIdx + 1}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>Live: {live.x.toFixed(2)}, {live.y.toFixed(2)}, {live.z.toFixed(2)}</div>
                </div>
                {(() => {
                  const p = sections[activeSectionIdx]?.pov || {}
                  return (
                    <>
                      <LabeledRow label="Position (X, Y, Z)">
                        <NumberInput value={p.x ?? 0} onChange={v => updatePovField(activeSectionIdx, 'x', Number(v || 0))} placeholder="X" />
                        <NumberInput value={p.y ?? 0} onChange={v => updatePovField(activeSectionIdx, 'y', Number(v || 0))} placeholder="Y" />
                        <NumberInput value={p.z ?? 0} onChange={v => updatePovField(activeSectionIdx, 'z', Number(v || 0))} placeholder="Z" />
                      </LabeledRow>

                      <LabeledRow label="Rotation (RX°, RY°, RZ°)">
                        <NumberInput value={p.rx ?? 0} onChange={v => updatePovField(activeSectionIdx, 'rx', Number(v || 0))} placeholder="RX" />
                        <NumberInput value={p.ry ?? 0} onChange={v => updatePovField(activeSectionIdx, 'ry', Number(v || 0))} placeholder="RY" />
                        <NumberInput value={p.rz ?? 0} onChange={v => updatePovField(activeSectionIdx, 'rz', Number(v || 0))} placeholder="RZ" />
                      </LabeledRow>

                      <LabeledRow label="FOV / LookAt (optional)">
                        <NumberInput value={p.fov ?? 50} onChange={v => updatePovField(activeSectionIdx, 'fov', Number(v || 0))} placeholder="FOV" />
                        <div />
                        <div />
                      </LabeledRow>

                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                          <input type="checkbox" checked={!!p.useLookAt} onChange={e => updatePovField(activeSectionIdx, 'useLookAt', !!e.target.checked)} />
                          <span style={{ fontSize: 13 }}>Use LookAt (target)</span>
                        </label>
                      </div>

                      {p.useLookAt && (
                        <LabeledRow label="LookAt Target (TX, TY, TZ)">
                          <NumberInput value={p.tx ?? 0} onChange={v => updatePovField(activeSectionIdx, 'tx', Number(v || 0))} placeholder="TX" />
                          <NumberInput value={p.ty ?? 0} onChange={v => updatePovField(activeSectionIdx, 'ty', Number(v || 0))} placeholder="TY" />
                          <NumberInput value={p.tz ?? 0} onChange={v => updatePovField(activeSectionIdx, 'tz', Number(v || 0))} placeholder="TZ" />
                        </LabeledRow>
                      )}

                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button onClick={() => previewSection(activeSectionIdx)} style={controlBtn}>Preview</button>
                        <button onClick={() => alert('POV applied — timeline updates automatically')} style={controlBtn}>Apply POV</button>
                      </div>

                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button onClick={() => grabCurrentToSection(activeSectionIdx)} style={controlBtn}>Grab Current → Inputs</button>
                        <button onClick={() => { navigator.clipboard?.writeText(JSON.stringify(sections[activeSectionIdx].pov || {}, null, 2)); alert('POV JSON copied') }} style={controlBtn}>Copy POV JSON</button>
                      </div>

                      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
                        Tip: gunakan <strong>Grab Current → Inputs</strong> untuk mengambil posisi kamera saat ini.
                      </div>
                    </>
                  )
                })()}
              </>
            )}

            {activeTab === 'visibility' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontWeight: 700 }}>Object Visibility — Section {activeSectionIdx + 1}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>{nodes.length} items</div>
                </div>

                <input placeholder="Search objects..." value={search} onChange={e => setSearch(e.target.value)} style={{
                  width: '100%', padding: 8, borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', color: '#fff', marginBottom: 8
                }} />

                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <button onClick={() => setAllVisibility(activeSectionIdx, true)} style={controlBtn}>Show All</button>
                  <button onClick={() => setAllVisibility(activeSectionIdx, false)} style={{ ...controlBtn, background: 'rgba(255,255,255,0.04)' }}>Hide All</button>
                  <button onClick={() => { navigator.clipboard?.writeText(JSON.stringify(sections[activeSectionIdx].visibility || {}, null, 2)); alert('Visibility JSON copied') }} style={controlBtn}>Copy JSON</button>
                </div>

                <div>
                  {(nodes.filter(n => n.name.toLowerCase().includes(search.toLowerCase()) || (n.path || '').toLowerCase().includes(search.toLowerCase()))).map(n => {
                    const cfg = (sections[activeSectionIdx]?.visibility?.[n.uuid]) || { visible: true, opacity: 1 }
                    return (
                      <div key={n.uuid} style={{ marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input type="checkbox" checked={!!cfg.visible} onChange={() => toggleObjectVisibility(activeSectionIdx, n.uuid)} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700 }}>{n.name}</div>
                            <div style={{ fontSize: 11, opacity: 0.6 }}>{n.path}</div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                          <input type="range" min="0" max="1" step="0.01" value={cfg.opacity} onChange={e => setObjectOpacity(activeSectionIdx, n.uuid, e.target.value)} style={{ flex: 1 }} />
                          <div style={{ width: 44, textAlign: 'right' }}>{Math.round((cfg.opacity ?? 1) * 100)}%</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button onClick={() => copySectionJSON(activeSectionIdx)} style={controlBtn}>Copy Section (POV + Objects)</button>
              <button onClick={() => copyAllJSON()} style={controlBtn}>Copy All Sections</button>
            </div>
          </div>
        </div>

        {/* RIGHT: Canvas */}
        <div style={{ position: 'relative', minHeight: 0 }}>
          <Canvas style={{ width: '100%', height: '100%' }} camera={{ position: [defaultPOVs[0].x, defaultPOVs[0].y, defaultPOVs[0].z], fov: defaultPOVs[0].fov }}>
            <Suspense fallback={<Loader />}>
              <ambientLight intensity={0.35} />
              <directionalLight position={[5, 10, 5]} intensity={0.7} />
              <Environment preset="city" />
              <SceneWithCamera
                modelPath="/8hres.glb"
                povs={povsForScene}
                setCamRef={setCamRef}
                lockInteractions={false}
                onSceneReady={handleSceneReady}
                visibility={visibilityMap}
                activeVisSection={activeSectionIdx}
              />
            </Suspense>
          </Canvas>
        </div>
      </div>

      {/* dynamic scroll trigger sections */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        {sections.map((_, i) => <section className={`section-${i+1}`} key={i} style={{ height: "100vh" }} />)}
        <section style={{ height: "140vh" }} />
      </div>
    </>
  )
}

/* ---------- UI style ---------- */
const controlBtn = {
  padding: '8px 10px',
  borderRadius: 6,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.08)',
  color: '#fff',
  cursor: 'pointer'
}
