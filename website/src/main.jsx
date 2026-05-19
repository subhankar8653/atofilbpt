import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

const root = ReactDOM.createRoot(document.getElementById('root'))

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Hide splash screen once React first renders
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.__hideSplash?.()
  })
})
