import React from "react"
import ReactDOM from "react-dom/client"
import { BrowserRouter, Routes, Route } from "react-router-dom"
import App from "./App"
import Hres from "./hres"
import Vawt from "./vawt"
import Sts from "./sts"
import StsParking from "./sts-parking"
import Sts15s from "./sts-15s"
import SetPOV from "./set-pov"
import HresAnimate from "./hres-animate"
import SetVisibleObjects from "./set-visible-objects"
import "./index.css"

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/hres" element={<Hres />} />
        <Route path="/vawt" element={<Vawt />} />
        <Route path="/sts" element={<Sts />} />
        <Route path="/sts-parking" element={<StsParking />} />
        <Route path="/sts-15s" element={<Sts15s />} />
        <Route path="/set-pov" element={<SetPOV />} />
        <Route path="/hres-animate" element={<HresAnimate />} />
        <Route path="/set-visible-objects" element={<SetVisibleObjects />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
