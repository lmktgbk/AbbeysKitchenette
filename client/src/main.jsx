import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/inter/wght-italic.css";
import "@fontsource-variable/space-grotesk/wght.css";
import './index.css'
import "sweetalert2/dist/sweetalert2.min.css";
import App from './App.jsx'

// Apply saved theme on page load (before render to prevent flash)
document.documentElement.classList.add(localStorage.getItem("theme") || "light")

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
