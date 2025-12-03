// src/SetVisibleObjects.jsx
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF, OrbitControls, Html, useProgress } from '@react-three/drei'
import * as THREE from 'three'

function MiniLoader() {
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

function PreviewScene({ modelPath, nodeStates, onReady }) {
  const { scene } = useGLTF(modelPath)

  useFrame(() => {
    if (!scene) return
    scene.traverse(o => {
      const s = nodeStates[o.uuid]
      if (!s) return
      // visibility
      if (o.visible !== s.visible) o.visible = s.visible

      // opacity + material handling
      if (o.isMesh && o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        mats.forEach(mat => {
          // only change if different to avoid needless updates
          const v = typeof s.opacity === 'number' ? s.opacity : 1
          if (mat.transparent !== true) mat.transparent = true
          if (Math.abs((mat.opacity ?? 1) - v) > 0.0001) {
            mat.opacity = v
            mat.needsUpdate = true
          }
        })
      }
    })
  })

  useEffect(() => {
    if (scene && onReady) onReady(scene)
  }, [scene, onReady])

  return (
    <>
      <primitive object={scene} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 10, 5]} intensity={0.8} />
    </>
  )
}

export default function SetVisibleObjects({ modelPath = '/8hres.glb' }) {
  const [nodes, setNodes] = useState([])
  const [query, setQuery] = useState('')
  const [sections, setSections] = useState([{}, {}, {}])
  const [activeSection, setActiveSection] = useState(0)

  // ensure body margin doesn't shrink layout (undo on unmount)
  useEffect(() => {
    const prev = document.body.style.margin
    document.body.style.margin = '0'
    return () => { document.body.style.margin = prev }
  }, [])

  const nodeStates = useMemo(() => {
    const map = {}
    nodes.forEach(n => {
      const cfg = (sections[activeSection] && sections[activeSection][n.uuid]) || { visible: true, opacity: 1 }
      map[n.uuid] = { visible: !!cfg.visible, opacity: typeof cfg.opacity === 'number' ? cfg.opacity : 1 }
    })
    return map
  }, [nodes, sections, activeSection])

  const handleSceneReady = useCallback(scene => {
    const list = []
    function walk(obj, depth = 0, path = '') {
      // include meshes and groups/objects for toggling
      if (obj.isMesh || obj.type === 'Group' || obj.type === 'Object3D') {
        const name = (obj.name && obj.name.trim()) ? obj.name : obj.type || 'Object'
        list.push({
          uuid: obj.uuid,
          name,
          depth,
          path: path ? `${path}/${name}` : name
        })
      }
      if (obj.children && obj.children.length) {
        obj.children.forEach(c => walk(c, depth + 1, path ? `${path}/${obj.name || obj.type}` : (obj.name || obj.type)))
      }
    }
    walk(scene)

    // initialize section configs without stomping existing values
    setSections(prev => {
      const next = prev.map(s => ({ ...s }))
      list.forEach(n => {
        next.forEach(sec => {
          if (!sec[n.uuid]) sec[n.uuid] = { visible: true, opacity: 1 }
        })
      })
      return next
    })

    setNodes(list)
  }, [])

  function toggleNode(uuid) {
    setSections(prev => {
      const clone = prev.map(s => ({ ...s }))
      const sec = clone[activeSection] || {}
      sec[uuid] = { ...(sec[uuid] || { visible: true, opacity: 1 }), visible: !(sec[uuid] ? sec[uuid].visible : true) }
      clone[activeSection] = sec
      return clone
    })
  }

  function setOpacity(uuid, value) {
    const v = Math.max(0, Math.min(1, Number(value)))
    setSections(prev => {
      const clone = prev.map(s => ({ ...s }))
      const sec = clone[activeSection] || {}
      sec[uuid] = { ...(sec[uuid] || { visible: true, opacity: 1 }), opacity: v }
      clone[activeSection] = sec
      return clone
    })
  }

  function setAllVisibility(val) {
    setSections(prev => {
      const clone = prev.map(s => ({ ...s }))
      const sec = clone[activeSection] || {}
      nodes.forEach(n => {
        sec[n.uuid] = { ...(sec[n.uuid] || { visible: true, opacity: 1 }), visible: !!val }
      })
      clone[activeSection] = sec
      return clone
    })
  }

  // filtered nodes for UI
  const filtered = nodes.filter(n => n.name.toLowerCase().includes(query.toLowerCase()) || n.path.toLowerCase().includes(query.toLowerCase()))

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'grid',
      gridTemplateColumns: 'minmax(540px, 1fr) 420px', // preview gets minimum width
      height: '100vh',
      width: '100vw',
      background: '#171717',
      color: '#fff',
      fontFamily: 'Inter, Roboto, sans-serif',
      zIndex: 9999
    }}>
      {/* LEFT: preview area */}
      <div style={{
        borderRight: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 540
      }}>
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          fontSize: 16,
          fontWeight: 700,
          background: 'linear-gradient(180deg,#101010,#111)'
        }}>
          GLB Preview — {modelPath}
        </div>

        <div style={{ flex: 1, minHeight: 0 }}>
          {/* force Canvas to occupy full available area */}
          <div style={{ width: '100%', height: '100%' }}>
            <Canvas style={{ width: '100%', height: '100%' }} camera={{ position: [0, 3, 9], fov: 50 }}>
              <React.Suspense fallback={<MiniLoader />}>
                <PreviewScene modelPath={modelPath} nodeStates={nodeStates} onReady={handleSceneReady} />
                <OrbitControls enablePan enableZoom enableRotate />
              </React.Suspense>
            </Canvas>
          </div>
        </div>

        <div style={{
          padding: 12,
          borderTop: '1px solid rgba(255,255,255,0.04)',
          display: 'flex',
          gap: 8,
          background: '#0f0f0f'
        }}>
          {[0,1,2].map(i => (
            <button
              key={i}
              onClick={() => setActiveSection(i)}
              style={{
                flex: 1,
                padding: '10px 6px',
                borderRadius: 6,
                border: activeSection === i ? '1px solid #8b5cf6' : '1px solid rgba(255,255,255,0.06)',
                background: activeSection === i ? '#8b5cf633' : 'transparent',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Section {i + 1}
            </button>
          ))}
        </div>
      </div>

      {/* RIGHT: controls */}
      <aside style={{
        width: 420,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        <div style={{
          padding: 12,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          background: '#0f0f0f'
        }}>
          <input
            placeholder="Search objects..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{
              flex: 1,
              padding: '8px 10px',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.03)',
              color: '#fff'
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setAllVisibility(true)} style={btn}>Show</button>
            <button onClick={() => setAllVisibility(false)} style={btn}>Hide</button>
          </div>
        </div>

        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: 12,
          paddingRight: 18
        }}>
          <div style={{ fontSize: 13, marginBottom: 8, opacity: 0.9 }}>Objects — {filtered.length} / {nodes.length}</div>

          {filtered.length === 0 ? (
            <div style={{ fontSize: 13, opacity: 0.7 }}>No objects found (wait until model loads or try Refresh)</div>
          ) : (
            filtered.map(n => {
              const cfg = (sections[activeSection] && sections[activeSection][n.uuid]) || { visible: true, opacity: 1 }
              return (
                <div key={n.uuid} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={!!cfg.visible} onChange={() => toggleNode(n.uuid)} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{n.name}</div>
                      <div style={{ fontSize: 11, opacity: 0.6 }}>{n.path}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={cfg.opacity}
                      onChange={e => setOpacity(n.uuid, e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <div style={{ width: 44, textAlign: 'right', fontSize: 12 }}>{Math.round(cfg.opacity * 100)}%</div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,0.04)', background: '#0f0f0f' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { navigator.clipboard?.writeText(JSON.stringify(sections[activeSection] || {}, null, 2)); alert('Section JSON copied') }} style={btn}>Copy JSON</button>
            <button onClick={() => { setSections([{}, {}, {}]); alert('All sections reset') }} style={btn}>Reset All</button>
          </div>
        </div>
      </aside>
    </div>
  )
}

const btn = {
  padding: '8px 10px',
  borderRadius: 6,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.08)',
  color: '#fff',
  cursor: 'pointer'
}
