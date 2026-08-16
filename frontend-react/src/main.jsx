import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'lenis/dist/lenis.css'
import './index.css'
import App from './App.jsx'
import { ReactLenis } from 'lenis/react'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ReactLenis root options={{ lerp: 0.1, duration: 1.2, smoothWheel: true }}>
      <App />
    </ReactLenis>
  </StrictMode>,
)

