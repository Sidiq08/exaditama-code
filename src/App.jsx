import React from "react"
import { Link } from "react-router-dom"

export default function App() {
  return (
    <div style={{ padding: 20 }}>
      <h1>Exaditama 3D Viewer</h1>
      <p>Pilih model yang ingin kamu lihat:</p>
      <ul>
        <li><Link to="/hres">Lihat HRES Model</Link></li>
        <li><Link to="/vawt">Lihat VAWT Model</Link></li>
        <li><Link to="/sts">Lihat STS Model</Link></li>
        <li><Link to="/sts-parking">Lihat STS Parking Model</Link></li>
        <li><Link to="/sts-15s">Lihat STS 15s</Link></li>
      </ul>
    </div>
  )
}
