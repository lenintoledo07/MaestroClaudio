import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/tokens.css'
import './styles/typography.css'
import './styles/components.css'
import { applyTheme, getCurrentTheme } from './hooks/useTheme'

// Aplicar el tema persistido ANTES del primer render para evitar el flash
// (de lo contrario el primer paint usa los defaults de :root y después
// cambia, generando un parpadeo).
applyTheme(getCurrentTheme())

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
