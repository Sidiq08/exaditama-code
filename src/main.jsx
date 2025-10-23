import React from "react"
import ReactDOM from "react-dom/client"
import { BrowserRouter, Routes, Route } from "react-router-dom"
import App from "./App"
import Hres from "./hres"
import Vawt from "./vawt"
import Sts from "./sts"
import "./index.css"

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/hres" element={<Hres />} />
        <Route path="/vawt" element={<Vawt />} />
        <Route path="/sts" element={<Sts />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
